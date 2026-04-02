// utils/workerExecutor.js
const { parentPort, workerData } = require('worker_threads');
const vm = require('vm');
const deepEqual = require('./deepEqual');

async function execute() {
  const { code, taskType, payload } = workerData;
  
  // 1. 构建一个受控的沙箱环境
  const sandbox = {
    // 允许用户使用 console.log 调试代码 (输出到服务器控制台)
    console: console,
    
    // 注入自定义的 require 函数
    require: (moduleName) => {
      // 安全黑名单：禁止加载高危 Node.js 核心模块
      const FORBIDDEN_MODULES =['fs', 'child_process', 'worker_threads', 'os', 'vm', 'cluster'];
      
      if (FORBIDDEN_MODULES.includes(moduleName) || moduleName.startsWith('node:')) {
        throw new Error(`Security Exception: Module '${moduleName}' is strictly forbidden.`);
      }
      
      // 允许加载其他的内置模块 (如 'crypto') 和 第三方 NPM 模块 (如 'lodash')
      try {
        return require(moduleName);
      } catch (err) {
        throw new Error(`Cannot find module '${moduleName}'. Is it installed on the server?`);
      }
    }
  };

  const context = vm.createContext(sandbox);
  
  const wrappedCode = `
    (() => {
      ${code}
      return {
        main: typeof main !== 'undefined' ? main : undefined,
        testCases: typeof testCases !== 'undefined' ? testCases : undefined
      };
    })();
  `;

  // 内部超时软限制
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