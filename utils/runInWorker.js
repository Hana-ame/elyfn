// utils/runInWorker.js
const { Worker } = require('worker_threads');
const path = require('path');
const config = require('../config');

let activeWorkers = 0;

/**
 * 在独立 Worker 线程中执行已落盘的 JS 函数文件
 * 具备并发上限（超限返回 429）、内存硬上限与超时强杀（504）
 */
function runInWorker(filePath, taskType, payload = null) {
  const maxConcurrency = config.MAX_CONCURRENCY || 8;
  if (activeWorkers >= maxConcurrency) {
    const err = new Error(`Too Many Requests: concurrency limit (${maxConcurrency}) reached`);
    err.status = 429;
    return Promise.reject(err);
  }

  activeWorkers++;

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (fn, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeWorkers--;
      fn(val);
    };

    const worker = new Worker(path.join(__dirname, 'workerExecutor.js'), {
      workerData: { filePath, taskType, payload },
      resourceLimits: {
        maxOldGenerationSizeMb: config.MAX_WORKER_MEM_MB || 64,
        maxYoungGenerationSizeMb: 16,
      },
    });

    const timer = setTimeout(() => {
      worker.terminate();
      const err = new Error('Execution timed out (Worker terminated)');
      err.status = 504;
      finish(reject, err);
    }, config.EXECUTION_TIMEOUT_MS);

    worker.on('message', (msg) => {
      worker.terminate();
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
      if (exitCode !== 0) {
        finish(reject, new Error(`Worker stopped abnormally with exit code ${exitCode}`));
      }
    });
  });
}

function getActiveWorkers() {
  return activeWorkers;
}

module.exports = runInWorker;
module.exports.getActiveWorkers = getActiveWorkers;
