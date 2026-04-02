// utils/extractFromCode.js

const vm = require('vm');
const config = require('../config');

/**
 * 从代码字符串中提取 main 函数和 testCases 数组
 * 解决 const/let 变量无法挂载到 vm context 的问题
 * @param {string} code - JavaScript 代码
 * @returns {Promise<{ main: Function, testCases: Array }>}
 */
async function extractFromCode(code) {
  const context = vm.createContext({});
  
  // 将用户的代码包裹在自执行函数中，主动 return 出需要的变量
  // 使用 typeof 防止用户未定义变量导致 ReferenceError 报错
  const wrappedCode = `
    (() => {
      ${code}
      
      return {
        main: typeof main !== 'undefined' ? main : undefined,
        testCases: typeof testCases !== 'undefined' ? testCases : undefined
      };
    })();
  `;

  // 将代码运行在该上下文中，超时限制
  const script = new vm.Script(wrappedCode, { filename: 'uploaded.js' });
  const extracted = script.runInContext(context, { timeout: config.EXECUTION_TIMEOUT_MS });
  
  const main = extracted.main;
  const testCases = extracted.testCases;
  
  // 只校验 main 函数是否存在，因为无论上传还是执行都需要 main
  if (typeof main !== 'function') {
    throw new Error('No valid main function found');
  }
  
  return { main, testCases };
}

module.exports = extractFromCode;