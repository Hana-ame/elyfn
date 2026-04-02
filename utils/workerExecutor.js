// utils/workerExecutor.js
const { parentPort, workerData } = require('worker_threads');
const vm = require('vm');
const deepEqual = require('./deepEqual');

async function execute() {
  const { code, taskType, payload } = workerData;
  const context = vm.createContext({});
  
  const wrappedCode = `
    (() => {
      ${code}
      return {
        main: typeof main !== 'undefined' ? main : undefined,
        testCases: typeof testCases !== 'undefined' ? testCases : undefined
      };
    })();
  `;

  // 内部超时仅作软限制，真正的硬限制由主线程 worker.terminate() 提供
  const script = new vm.Script(wrappedCode, { filename: 'function.js' });
  const extracted = script.runInContext(context, { timeout: 4500 });

  if (typeof extracted.main !== 'function') {
    throw new Error('No valid main function found');
  }

  // 场景A: 测试上传代码
  if (taskType === 'test') {
    const testCases = extracted.testCases;
    if (!Array.isArray(testCases)) throw new Error('No valid testCases array found in code');
    
    const errors =[];
    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      if (!tc.hasOwnProperty('input') || !tc.hasOwnProperty('expected')) {
        errors.push({ testCaseIndex: i, error: 'Missing input or expected property' });
        continue;
      }
      try {
        const actual = await extracted.main(tc.input);
        if (!deepEqual(actual, tc.expected)) {
          errors.push({ testCaseIndex: i, input: tc.input, expected: tc.expected, actual });
        }
      } catch (err) {
        errors.push({ testCaseIndex: i, input: tc.input, error: err.message });
      }
    }
    parentPort.postMessage({ passed: errors.length === 0, errors });
  } 
  
  // 场景B: 正常执行请求
  else if (taskType === 'execute') {
    const result = await extracted.main(payload);
    parentPort.postMessage({ result });
  }
}

execute().catch(err => {
  parentPort.postMessage({ error: err.message || String(err) });
});