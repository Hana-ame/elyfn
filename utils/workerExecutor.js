// utils/workerExecutor.js
const { parentPort, workerData } = require('worker_threads');
const vm = require('vm');
const deepEqual = require('./deepEqual');

async function execute() {
  const { code, taskType, payload } = workerData;
  
  // 1. 构建严格受控的沙箱环境
  const sandbox = {
    console: console,
    setTimeout, clearTimeout,
    setInterval, clearInterval,
    
    // 自定义异步 require，仅支持远程 URL 加载
    require: async (url) => {
      if (typeof url !== 'string' || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        throw new Error(`Security Exception: Only URL imports are allowed. Blocked: '${url}'`);
      }
      
      try {
        // 请求远程代码
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        const moduleCode = await response.text();
        
        // 创建子沙箱执行远程库，防止变量污染
        const exports = {};
        const module = { exports };
        const moduleSandbox = { module, exports, console, setTimeout, clearTimeout };
        moduleSandbox.global = moduleSandbox; 
        
        vm.createContext(moduleSandbox);
        const script = new vm.Script(moduleCode, { filename: url });
        
        script.runInContext(moduleSandbox, { timeout: 2000 }); 
        return moduleSandbox.module.exports;
      } catch (err) {
        throw new Error(`Failed to load remote module from '${url}': ${err.message}`);
      }
    }
  };

  const context = vm.createContext(sandbox);
  
  // 2. 将代码包裹在 async 闭包中，允许用户代码使用 await
  const wrappedCode = `
    (async () => {
      ${code}
      return {
        main: typeof main !== 'undefined' ? main : undefined,
        testCases: typeof testCases !== 'undefined' ? testCases : undefined
      };
    })();
  `;

  const script = new vm.Script(wrappedCode, { filename: 'function.js' });
  
  // 因为外层是 async，这里返回的是一个 Promise
  const extractedPromise = script.runInContext(context, { timeout: 4500 });
  const extracted = await extractedPromise; 

  if (!extracted || typeof extracted.main !== 'function') {
    throw new Error('No valid main function found');
  }

  // 3. 执行测试用例
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
  
  // 4. 处理常规执行
  else if (taskType === 'execute') {
    const result = await extracted.main(payload);
    parentPort.postMessage({ result });
  }
}

execute().catch(err => {
  parentPort.postMessage({ error: err.message || String(err) });
});