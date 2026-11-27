const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const config = require('../config');
const runInWorker = require('../utils/runInWorker');
const { isValidFolder, isValidFuncName, isValidSourceFilename, getBaseName } = require('../utils/validator');
const uploadHandler = require('../handlers/upload');
const executeHandler = require('../handlers/execute');
const { listFunctions, getCatalog, deleteFunction } = require('../handlers/manage');

function makeFileBlob(content) {
  const buf = Buffer.from(content, 'utf-8');
  return {
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}

test('config.parseEnvValue handles quotes, escapes, and inline comments', () => {
  assert.equal(config.parseEnvValue('8   # comment'), '8');
  assert.equal(config.parseEnvValue('pass#123'), 'pass#123');
  assert.equal(config.parseEnvValue('"p#ss \\"word\\""'), 'p#ss "word"');
  assert.equal(config.parseEnvValue("'single # quote'"), 'single # quote');
});

test('validator rejects traversal and invalid identifiers', () => {
  assert.equal(isValidFolder('math_1'), true);
  assert.equal(isValidFolder('../etc'), false);
  assert.equal(isValidFuncName('square'), true);
  assert.equal(isValidFuncName('square.js'), true);
  assert.equal(isValidFuncName('square.py'), false);
  assert.equal(isValidSourceFilename('greet.ts'), true);
  assert.equal(isValidSourceFilename('greet'), false);
  assert.equal(getBaseName('square.js'), 'square');
});

test('runInWorker.buildWorkerEnv isolates host secrets and allows ELYFN_FN_*', () => {
  const clean = runInWorker.buildWorkerEnv(
    {
      NODE_ENV: 'production',
      PATH: '/usr/bin',
      GITHUB_TOKEN: 'ghp_super_secret',
      GH_TOKEN: 'ghp_super_secret_2',
      ELYFN_ADMIN_KEY: 'admin-secret',
      BLUEPRINT_SAVE_KEY: 'save-secret',
      ELYFN_FN_GREETING: 'hello',
      CUSTOM_ALLOWED: 'yes',
    },
    ['CUSTOM_ALLOWED']
  );

  assert.equal(clean.NODE_ENV, 'production');
  assert.equal(clean.ELYFN_FN_GREETING, 'hello');
  assert.equal(clean.CUSTOM_ALLOWED, 'yes');
  assert.equal(clean.GITHUB_TOKEN, undefined);
  assert.equal(clean.GH_TOKEN, undefined);
  assert.equal(clean.ELYFN_ADMIN_KEY, undefined);
  assert.equal(clean.BLUEPRINT_SAVE_KEY, undefined);
});

test('end-to-end upload, catalog, execute, env isolation, rollback, timeout, concurrency, and delete', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'elyfn-test-'));
  const prevBaseDir = config.BASE_DIR;
  const prevTimeout = config.EXECUTION_TIMEOUT_MS;
  const prevConcurrency = config.MAX_CONCURRENCY;
  const prevGh = process.env.GITHUB_TOKEN;
  const prevFnVar = process.env.ELYFN_FN_TAG;

  config.BASE_DIR = tmpDir;
  process.env.GITHUB_TOKEN = 'ghp_should_never_leak';
  process.env.ELYFN_FN_TAG = 'allowed-tag';

  try {
    // 1. Upload a valid JS function
    const setUpload = { status: 200 };
    const uploadRes = await uploadHandler({
      params: { folder: 'demo', filename: 'inspect.js' },
      body: {
        file: makeFileBlob(`
          module.exports = {
            main: async (input) => ({
              doubled: Number(input.x) * 2,
              hasGhToken: Boolean(process.env.GITHUB_TOKEN),
              fnTag: process.env.ELYFN_FN_TAG || null,
            }),
            testCases: [
              { input: { x: 3 }, expected: { doubled: 6, hasGhToken: false, fnTag: 'allowed-tag' } },
            ],
          };
        `),
      },
      set: setUpload,
    });
    assert.equal(setUpload.status, 201);
    assert.equal(uploadRes.success, true);

    // 2. Read-only catalog returns function metadata without exposing source code
    const setCatalog = { status: 200 };
    const catRes = await getCatalog({ set: setCatalog });
    assert.equal(catRes.success, true);
    assert.equal(catRes.count, 1);
    assert.deepEqual(catRes.functions, { demo: ['inspect'] });
    assert.equal(catRes.endpoints[0].endpoint, '/demo/inspect');

    // 3. Admin list returns .js files
    const listRes = await listFunctions({ set: { status: 200 } });
    assert.deepEqual(listRes.functions, { demo: ['inspect.js'] });

    // 4. Execute verifies live worker execution + env isolation
    const setExec = { status: 200 };
    const execRes = await executeHandler({
      params: { folder: 'demo', filename: 'inspect' },
      body: { x: 21 },
      set: setExec,
    });
    assert.equal(setExec.status, 200);
    assert.deepEqual(execRes, { doubled: 42, hasGhToken: false, fnTag: 'allowed-tag' });

    // 5. Failed testCases during hot-reload must keep previous version intact
    const setBad = { status: 200 };
    const badRes = await uploadHandler({
      params: { folder: 'demo', filename: 'inspect.js' },
      body: {
        file: makeFileBlob(`
          module.exports = {
            main: async () => ({ broken: true }),
            testCases: [{ input: {}, expected: { broken: false } }],
          };
        `),
      },
      set: setBad,
    });
    assert.equal(setBad.status, 400);
    assert.equal(badRes.error, 'Test cases failed');

    const afterRollback = await executeHandler({
      params: { folder: 'demo', filename: 'inspect' },
      body: { x: 5 },
      set: { status: 200 },
    });
    assert.equal(afterRollback.doubled, 10);

    // 6. Timeout enforcement (504) & concurrency limit (429)
    const slowFile = path.join(tmpDir, 'demo', 'slow.js');
    await fs.writeFile(
      slowFile,
      `module.exports = { main: async () => new Promise((r) => setTimeout(() => r({ ok: true }), 400)) };`,
      'utf-8'
    );

    config.EXECUTION_TIMEOUT_MS = 120;
    const setTimeoutRes = { status: 200 };
    await executeHandler({
      params: { folder: 'demo', filename: 'slow' },
      body: {},
      set: setTimeoutRes,
    });
    assert.equal(setTimeoutRes.status, 504);

    await runInWorker.waitForWorkers(2000);
    config.EXECUTION_TIMEOUT_MS = 2000;
    config.MAX_CONCURRENCY = 1;
    const setP1 = { status: 200 };
    const setP2 = { status: 200 };
    const p1 = executeHandler({ params: { folder: 'demo', filename: 'slow' }, body: {}, set: setP1 });
    const p2 = executeHandler({ params: { folder: 'demo', filename: 'slow' }, body: {}, set: setP2 });
    await Promise.all([p1, p2]);
    assert.deepEqual([setP1.status, setP2.status].sort((a, b) => a - b), [200, 429]);

    // 7. Delete cleans up function
    const setDel = { status: 200 };
    const delRes = await deleteFunction({ params: { folder: 'demo', filename: 'inspect' }, set: setDel });
    assert.equal(delRes.success, true);
  } finally {
    config.BASE_DIR = prevBaseDir;
    config.EXECUTION_TIMEOUT_MS = prevTimeout;
    config.MAX_CONCURRENCY = prevConcurrency;
    if (prevGh === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = prevGh;
    if (prevFnVar === undefined) delete process.env.ELYFN_FN_TAG;
    else process.env.ELYFN_FN_TAG = prevFnVar;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('adapter.createByteLimitStream aborts chunked payloads exceeding limit with 413', async () => {
  const { Readable } = require('node:stream');
  const { createByteLimitStream, PayloadTooLargeError } = require('../adapter');

  const limiter = createByteLimitStream(16);
  const src = Readable.from([Buffer.from('1234567890'), Buffer.from('abcdefghij')]);

  await assert.rejects(
    async () => {
      src.pipe(limiter);
      for await (const _chunk of limiter) {
        // consume
      }
    },
    (err) => err instanceof PayloadTooLargeError && err.status === 413
  );
});

test('async execution returns 202 jobId and GET /jobs/:id reports running -> completed result', async () => {
  const { getJobStatus, listJobStatuses } = require('../handlers/jobs');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'elyfn-async-test-'));
  const prevBaseDir = config.BASE_DIR;
  config.BASE_DIR = tmpDir;

  try {
    const code = `
      exports.main = async (input) => {
        await new Promise((r) => setTimeout(r, 80));
        return { ok: true, echo: input && input.msg };
      };
      exports.testCases = [{ input: { msg: 'hi' }, expected: { ok: true, echo: 'hi' } }];
    `;
    const setUpload = { status: 200 };
    await uploadHandler({
      params: { folder: 'asyncdemo', filename: 'slowecho.js' },
      body: { file: makeFileBlob(code) },
      set: setUpload,
    });
    assert.equal(setUpload.status, 201);

    const setExec = { status: 200 };
    const accepted = await executeHandler({
      params: { folder: 'asyncdemo', filename: 'slowecho' },
      body: { msg: 'hello-job' },
      query: { async: '1' },
      set: setExec,
    });
    assert.equal(setExec.status, 202);
    assert.equal(accepted.async, true);
    assert.equal(accepted.status, 'running');
    assert.ok(accepted.jobId);

    // Poll until completed
    let polled;
    for (let i = 0; i < 30; i++) {
      const setJob = { status: 200 };
      polled = await getJobStatus({ params: { id: accepted.jobId }, set: setJob });
      if (polled.status === 'completed' || polled.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 40));
    }
    assert.equal(polled.status, 'completed');
    assert.deepEqual(polled.result, { ok: true, echo: 'hello-job' });

    const listRes = await listJobStatuses();
    assert.ok(listRes.jobs.some((j) => j.id === accepted.jobId && j.status === 'completed'));

    const setMissing = { status: 200 };
    await getJobStatus({ params: { id: 'non-existent-id' }, set: setMissing });
    assert.equal(setMissing.status, 404);
  } finally {
    config.BASE_DIR = prevBaseDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('async execution records failed status and error when worker throws', async () => {
  const { getJobStatus } = require('../handlers/jobs');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'elyfn-async-fail-'));
  const prevBaseDir = config.BASE_DIR;
  config.BASE_DIR = tmpDir;

  try {
    const code = `
      exports.main = async (input) => {
        if (input && input.boom) throw new Error('intentional async failure');
        return { ok: true };
      };
      exports.testCases = [{ input: { boom: false }, expected: { ok: true } }];
    `;
    const setUpload = { status: 200 };
    await uploadHandler({
      params: { folder: 'faildemo', filename: 'boom.js' },
      body: { file: makeFileBlob(code) },
      set: setUpload,
    });
    assert.equal(setUpload.status, 201);

    const setExec = { status: 200 };
    const accepted = await executeHandler({
      params: { folder: 'faildemo', filename: 'boom' },
      body: { boom: true },
      query: { async: '1' },
      set: setExec,
    });
    assert.equal(setExec.status, 202);

    let polled;
    for (let i = 0; i < 30; i++) {
      polled = await getJobStatus({ params: { id: accepted.jobId }, set: { status: 200 } });
      if (polled.status === 'completed' || polled.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 40));
    }
    assert.equal(polled.status, 'failed');
    assert.ok(String(polled.error).includes('intentional async failure'));
  } finally {
    config.BASE_DIR = prevBaseDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('HTTP router + auth middleware enforce EXEC_KEY/ADMIN_KEY on /catalog, /jobs, and ?async=1', async () => {
  const http = require('node:http');
  const { createNodeAdapter } = require('../adapter');
  const app = require('../app');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'elyfn-http-test-'));
  const prevBaseDir = config.BASE_DIR;
  const prevAdminKey = config.ADMIN_KEY;
  const prevExecKey = config.EXEC_KEY;
  config.BASE_DIR = tmpDir;
  config.ADMIN_KEY = 'http-admin-secret';
  config.EXEC_KEY = 'http-exec-secret';

  await fs.mkdir(path.join(tmpDir, 'httpdemo'), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, 'httpdemo', 'add.js'),
    'exports.main = (input) => ({ sum: Number(input.a || 0) + Number(input.b || 0) });',
    'utf-8'
  );

  const server = http.createServer(createNodeAdapter(app));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const requestJson = (method, reqPath, { headers = {}, body } = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: reqPath,
          method,
          headers: {
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...headers,
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            let json = null;
            try {
              json = JSON.parse(raw);
            } catch {
              // ignore non-json
            }
            resolve({ status: res.statusCode, raw, json });
          });
        }
      );
      req.on('error', reject);
      if (body !== undefined) req.write(JSON.stringify(body));
      req.end();
    });

  try {
    // 1. Unauthenticated access to /catalog and /jobs rejected when EXEC_KEY is set
    const unauthCatalog = await requestJson('GET', '/catalog');
    assert.equal(unauthCatalog.status, 401);
    const unauthJobs = await requestJson('GET', '/jobs');
    assert.equal(unauthJobs.status, 401);

    // 2. EXEC_KEY cannot hit /manage/list (403)
    const execManage = await requestJson('GET', '/manage/list', {
      headers: { Authorization: 'Bearer http-exec-secret' },
    });
    assert.equal(execManage.status, 403);

    // 3. Valid EXEC_KEY can submit ?async=1 and poll GET /jobs/:id
    const execAsync = await requestJson('POST', '/httpdemo/add?async=1', {
      headers: { Authorization: 'Bearer http-exec-secret' },
      body: { a: 19, b: 23 },
    });
    assert.equal(execAsync.status, 202);
    assert.equal(execAsync.json.async, true);
    assert.ok(execAsync.json.jobId);

    let jobRes;
    for (let i = 0; i < 30; i++) {
      jobRes = await requestJson('GET', `/jobs/${execAsync.json.jobId}`, {
        headers: { Authorization: 'Bearer http-exec-secret' },
      });
      if (jobRes.json && jobRes.json.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 40));
    }
    assert.equal(jobRes.status, 200);
    assert.equal(jobRes.json.status, 'completed');
    assert.deepEqual(jobRes.json.result, { sum: 42 });

    // 4. GET /jobs lists the completed job
    const jobsList = await requestJson('GET', '/jobs', {
      headers: { Authorization: 'Bearer http-exec-secret' },
    });
    assert.equal(jobsList.status, 200);
    assert.ok(jobsList.json.jobs.some((j) => j.id === execAsync.json.jobId));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    config.BASE_DIR = prevBaseDir;
    config.ADMIN_KEY = prevAdminKey;
    config.EXEC_KEY = prevExecKey;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('async execution rejects with 429 when pool saturated and jobStore preserves running jobs on prune', async () => {
  const jobStore = require('../utils/jobStore');

  const prevMaxJobs = config.MAX_JOBS;
  config.MAX_JOBS = 2;
  try {
    const jRunning = jobStore.createJob({ folder: 'p', name: 'long' });
    const jDone1 = jobStore.createJob({ folder: 'p', name: 'fast1' });
    jobStore.completeJob(jDone1.id, { ok: 1 });
    // Creating a third job should evict finished jDone1, NOT running jRunning
    const jRunning2 = jobStore.createJob({ folder: 'p', name: 'long2' });
    assert.ok(jobStore.getJob(jRunning.id), 'active running job should not be evicted before finished jobs');
    assert.equal(jobStore.getJob(jDone1.id), null, 'finished job should be evicted first');
    jobStore.completeJob(jRunning.id, { done: true });
    jobStore.completeJob(jRunning2.id, { done: true });
  } finally {
    config.MAX_JOBS = prevMaxJobs;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'elyfn-async-429-'));
  const prevBaseDir = config.BASE_DIR;
  const prevConc = config.MAX_CONCURRENCY;
  config.BASE_DIR = tmpDir;
  config.MAX_CONCURRENCY = 1;

  try {
    await fs.mkdir(path.join(tmpDir, 'sat'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'sat', 'hold.js'),
      'exports.main = async () => { await new Promise((r) => setTimeout(r, 250)); return { ok: true }; };',
      'utf-8'
    );

    const set1 = { status: 200 };
    const res1 = await executeHandler({ params: { folder: 'sat', filename: 'hold' }, body: {}, query: { async: '1' }, set: set1 });
    assert.equal(set1.status, 202);
    assert.ok(res1.jobId);

    const set2 = { status: 200 };
    await executeHandler({ params: { folder: 'sat', filename: 'hold' }, body: {}, query: { async: '1' }, set: set2 });
    assert.equal(set2.status, 429);

    await runInWorker.waitForWorkers(2000);
  } finally {
    config.BASE_DIR = prevBaseDir;
    config.MAX_CONCURRENCY = prevConc;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('developer UI /manage/ and /admin/ serve HTML shell without exposing secrets, while /manage/list still enforces 403 and buildWorkerEnv keeps CLI paths', async () => {
  const clean = runInWorker.buildWorkerEnv({
    PATH: '/usr/bin',
    AGY_PATH: '/usr/bin/agy',
    PI_PATH: '/usr/local/bin/pi',
    GH_CLI_PATH: '/usr/bin/gh',
    GH_TOKEN: 'ghp_secret_must_strip',
    ELYFN_ADMIN_KEY: 'admin_secret_must_strip',
  });
  assert.equal(clean.AGY_PATH, '/usr/bin/agy');
  assert.equal(clean.PI_PATH, '/usr/local/bin/pi');
  assert.equal(clean.GH_CLI_PATH, '/usr/bin/gh');
  assert.equal(clean.GH_TOKEN, undefined);
  assert.equal(clean.ELYFN_ADMIN_KEY, undefined);

  const { createServer } = require('node:http');
  const { createNodeAdapter } = require('../adapter');
  const app = require('../app');
  const prevAdminKey = config.ADMIN_KEY;
  config.ADMIN_KEY = 'ui-admin-secret';
  const srv = createServer(createNodeAdapter(app));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${srv.address().port}`;
  try {
    const manageRes = await fetch(`${baseUrl}/manage/`);
    assert.equal(manageRes.status, 200);
    assert.equal(manageRes.headers.get('content-type'), 'text/html; charset=utf-8');
    const html = await manageRes.text();
    assert.match(html, /elyfn/);
    assert.equal(html.includes('ui-admin-secret'), false);

    const adminRes = await fetch(`${baseUrl}/admin`);
    assert.equal(adminRes.status, 200);
    assert.equal(adminRes.headers.get('content-type'), 'text/html; charset=utf-8');

    const listDenied = await fetch(`${baseUrl}/manage/list`);
    assert.equal(listDenied.status, 403);
  } finally {
    await new Promise((r) => srv.close(r));
    config.ADMIN_KEY = prevAdminKey;
  }
});
