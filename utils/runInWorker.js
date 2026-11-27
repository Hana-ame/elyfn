// utils/runInWorker.js
const { Worker } = require('worker_threads');
const path = require('path');
const config = require('../config');

// 独立并发池：防止公网 execute 流量打满后饿死管理员 upload 测试
const pools = {
  execute: { active: 0 },
  test: { active: 0 },
};
const runningWorkers = new Set();

const SAFE_BASE_ENV_KEYS = new Set(['NODE_ENV', 'PATH', 'TZ', 'LANG', 'LC_ALL', 'LC_CTYPE', 'AGY_PATH', 'PI_PATH', 'GH_CLI_PATH']);

/**
 * 构造隔离的 Worker 环境变量：
 * - 仅透传基础运行变量、ELYFN_FN_* 自定义函数变量以及 ELYFN_WORKER_ENV_ALLOW 白名单变量；
 * - 显式剥离宿主/同容器内其它服务密钥（如 GITHUB_TOKEN、ELYFN_ADMIN_KEY、BLUEPRINT_SAVE_KEY 等）。
 */
function buildWorkerEnv(sourceEnv = process.env, allowList = config.WORKER_ENV_ALLOW) {
  const allowSet = new Set(Array.isArray(allowList) ? allowList : []);
  const cleanEnv = {};
  for (const [key, value] of Object.entries(sourceEnv || {})) {
    if (value === undefined) continue;
    if (SAFE_BASE_ENV_KEYS.has(key) || key.startsWith('ELYFN_FN_') || allowSet.has(key)) {
      cleanEnv[key] = String(value);
    }
  }
  return cleanEnv;
}

function getPoolLimit(taskType) {
  return taskType === 'test'
    ? (config.MAX_TEST_CONCURRENCY || 2)
    : (config.MAX_CONCURRENCY || 8);
}

/**
 * 在独立 Worker 线程中执行已落盘的 JS 函数文件
 * - 同步创建失败也会安全回收计数，防止永久 429
 * - 仅在 Worker 真正 exit 后才释放并发配额，防止异步 terminate 期间并发超限 OOM
 * - 退出码为 0 但未返回消息也会立刻失败，避免假性 504 超时
 */
function runInWorker(filePath, taskType, payload = null, options = {}) {
  const poolKey = taskType === 'test' ? 'test' : 'execute';
  const pool = pools[poolKey];
  const limit = getPoolLimit(poolKey);
  const timeoutMs =
    typeof options.timeoutMs === 'number' && options.timeoutMs > 0
      ? options.timeoutMs
      : config.EXECUTION_TIMEOUT_MS;

  if (pool.active >= limit) {
    const err = new Error(`Too Many Requests: ${poolKey} concurrency limit (${limit}) reached`);
    err.status = 429;
    return Promise.reject(err);
  }

  let worker;
  try {
    worker = new Worker(path.join(__dirname, 'workerExecutor.js'), {
      workerData: { filePath, taskType, payload },
      env: buildWorkerEnv(),
      resourceLimits: {
        maxOldGenerationSizeMb: config.MAX_WORKER_MEM_MB || 64,
        maxYoungGenerationSizeMb: 16,
      },
    });
  } catch (err) {
    return Promise.reject(err);
  }

  pool.active++;
  runningWorkers.add(worker);

  let released = false;
  const releaseSlot = () => {
    if (released) return;
    released = true;
    pool.active--;
    runningWorkers.delete(worker);
  };

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (fn, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(val);
    };

    const timer = setTimeout(() => {
      worker.terminate().catch(() => {});
      const err = new Error('Execution timed out (Worker terminated)');
      err.status = 504;
      finish(reject, err);
    }, timeoutMs);

    worker.on('message', (msg) => {
      worker.terminate().catch(() => {});
      if (msg && msg.error) {
        finish(reject, new Error(msg.error));
      } else {
        finish(resolve, msg);
      }
    });

    worker.on('error', (err) => {
      finish(reject, err);
    });

    worker.on('exit', (exitCode) => {
      releaseSlot();
      if (!settled) {
        const msg =
          exitCode === 0
            ? 'Worker exited early without returning a result'
            : `Worker stopped abnormally with exit code ${exitCode}`;
        finish(reject, new Error(msg));
      }
    });
  });
}

function getActiveWorkers(taskType = 'execute') {
  return (pools[taskType] || pools.execute).active;
}

function hasWorkerSlot(taskType = 'execute') {
  const poolKey = taskType === 'test' ? 'test' : 'execute';
  return pools[poolKey].active < getPoolLimit(poolKey);
}

async function waitForWorkers(timeoutMs = 6000) {
  const start = Date.now();
  while (runningWorkers.size > 0 && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function terminateAllWorkers() {
  const workers = Array.from(runningWorkers);
  await Promise.allSettled(workers.map((w) => w.terminate()));
}

module.exports = runInWorker;
module.exports.buildWorkerEnv = buildWorkerEnv;
module.exports.getActiveWorkers = getActiveWorkers;
module.exports.hasWorkerSlot = hasWorkerSlot;
module.exports.waitForWorkers = waitForWorkers;
module.exports.terminateAllWorkers = terminateAllWorkers;
