// utils/workerExecutor.js
const { parentPort, workerData } = require('worker_threads');
const vm = require('vm');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const deepEqual = require('./deepEqual');

// 统一的依赖缓存目录，存放在项目根目录下的 .module_cache 文件夹中
const CACHE_DIR = path.join(process.cwd(), '.module_cache');

async function execute() {
  const { code, taskType, payload } = workerData;
  
  // 内存缓存：防止同一个代码文件里 require 两次相同的 URL 导致重复执行编译
  const moduleMemoryCache = {};
  
  const sandbox = {
    console: console,
    setTimeout, clearTimeout,
    setInterval, clearInterval,
    
    // 带有缓存机制的异步 require
    require: async (url) => {
      if (typeof url !== 'string' || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        throw new Error(`Security Exception: Only URL imports are allowed. Blocked: '${url}'`);
      }
      
      // 1. 命中内存缓存（同一函数内重复引入）
      if (moduleMemoryCache[url]) {
        return moduleMemoryCache[url];
      }

      // 将 URL 转换为安全的 MD5 文件名
      const urlHash = crypto.createHash('md5').update(url).digest('hex');
      const cacheFile = path.join(CACHE_DIR, `${urlHash}.js`);
      
      let moduleCode = '';
      
      try {
        // 2. 命中磁盘缓存：尝试从本地读取已经下载过的依赖
        moduleCode = await fs.readFile(cacheFile, 'utf-8');
      } catch (err) {
        // 3. 缓存未命中：从网络拉取依赖
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        moduleCode = await response.text();
        
        // 异步将代码保存到磁盘缓存中（供下次调用或其他请求使用）
        try {
          await fs.mkdir(CACHE_DIR, { recursive: true });
          await fs.writeFile(cacheFile, moduleCode, 'utf-8');
        } catch (writeErr) {
          console.error(`Failed to write cache for ${url}:`, writeErr);
        }
      }
      
      // 创建子沙箱执行远程库代码
      const exports = {};
      const module = { exports };
      const moduleSandbox = { module, exports, console, setTimeout, clearTimeout };
      moduleSandbox.global = moduleSandbox; 
      
      vm.createContext(moduleSandbox);
      const script = new vm.Script(moduleCode, { filename: url });
      
      script.runInContext(moduleSandbox, { timeout: 2000 }); 
      
      // 保存到内存缓存并返回
      moduleMemoryCache[url] = moduleSandbox.module.exports;
      return moduleMemoryCache[url];
    }
  };

  const context = vm.createContext(sandbox);
  
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
  const extractedPromise = script.runInContext(context, { timeout: 4500 });
  const extracted = await extractedPromise; 

  if (!extracted || typeof extracted.main !== 'function') {
    throw new Error('No valid main function found');
  }

  // --- 测试用例执行逻辑 ---
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
  // --- 正常请求执行逻辑 ---
  else if (taskType === 'execute') {
    const result = await extracted.main(payload);
    parentPort.postMessage({ result });
  }
}

execute().catch(err => {
  parentPort.postMessage({ error: err.message || String(err) });
});