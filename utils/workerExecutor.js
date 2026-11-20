// utils/workerExecutor.js
const { parentPort, workerData } = require('worker_threads');
const deepEqual = require('./deepEqual');

async function execute() {
  const { filePath, taskType, payload } = workerData;

  // 开发者已通过 ADMIN_KEY 鉴权，直接原生 require 加载模块（免 vm 沙箱）
  const mod = require(filePath);
  const mainFunc = typeof mod === 'function' ? mod : mod && mod.main;

  if (typeof mainFunc !== 'function') {
    throw new Error('Function file must export a "main" function (e.g. module.exports = { main, testCases })');
  }

  if (taskType === 'test') {
    const testCases = mod && mod.testCases;
    if (!Array.isArray(testCases)) {
      throw new Error('Function file must export a "testCases" array');
    }

    const errors = [];
    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      if (!tc || !Object.prototype.hasOwnProperty.call(tc, 'input') || !Object.prototype.hasOwnProperty.call(tc, 'expected')) {
        errors.push({ testCaseIndex: i, error: 'Missing input or expected property' });
        continue;
      }
      try {
        const actual = await mainFunc(tc.input);
        if (!deepEqual(actual, tc.expected)) {
          errors.push({ testCaseIndex: i, input: tc.input, expected: tc.expected, actual });
        }
      } catch (err) {
        errors.push({ testCaseIndex: i, input: tc.input, error: err.message });
      }
    }

    parentPort.postMessage({ passed: errors.length === 0, errors });
  } else if (taskType === 'execute') {
    const result = await mainFunc(payload);
    parentPort.postMessage({ result });
  } else {
    throw new Error(`Unknown taskType: ${taskType}`);
  }
}

execute().catch((err) => {
  parentPort.postMessage({ error: err.message || String(err) });
});
