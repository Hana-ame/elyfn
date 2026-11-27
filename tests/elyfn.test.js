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

    config.EXECUTION_TIMEOUT_MS = 2000;
    config.MAX_CONCURRENCY = 1;
    const p1 = executeHandler({ params: { folder: 'demo', filename: 'slow' }, body: {}, set: { status: 200 } });
    const set429 = { status: 200 };
    const p2 = executeHandler({ params: { folder: 'demo', filename: 'slow' }, body: {}, set: set429 });
    await Promise.all([p1, p2]);
    assert.equal(set429.status, 429);

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
