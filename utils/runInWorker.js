// utils/runInWorker.js
const { Worker } = require('worker_threads');
const path = require('path');
const config = require('../config');

/**
 * 在独立线程中执行用户代码，防止阻塞主事件循环和死循环
 */
function runInWorker(code, taskType, payload = null) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'workerExecutor.js'), {
      workerData: { code, taskType, payload }
    });

    // 定时炸弹：超时强制杀灭线程
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Execution timed out (Worker terminated to protect server)'));
    }, config.EXECUTION_TIMEOUT_MS);

    worker.on('message', (msg) => {
      clearTimeout(timer);
      if (msg.error) {
        reject(new Error(msg.error));
      } else {
        resolve(msg);
      }
      worker.terminate(); // 释放资源
    });

    worker.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    worker.on('exit', (exitCode) => {
      clearTimeout(timer);
      if (exitCode !== 0) reject(new Error(`Worker stopped abnormally with exit code ${exitCode}`));
    });
  });
}

module.exports = runInWorker;