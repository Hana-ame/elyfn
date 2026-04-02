const fs = require('fs').promises;
const path = require('path');
const vm = require('vm');
const config = require('../config');

/**
 * 深度相等比较
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!keysB.includes(key) || !deepEqual(a[key], b[key])) return false;
  }
  return true;
}

/**
 * 从代码中提取 main 函数和 testCases
 */
async function extractFromCode(code) {
  // 创建一个新的 VM 上下文，但允许访问当前全局对象的副本
  const context = { main: null, testCases: null };
  const script = new vm.Script(code, { filename: 'uploaded.js' });
  // 将代码执行在 context 中，并让 context 作为全局对象
  script.runInNewContext(context, { timeout: config.EXECUTION_TIMEOUT_MS });
  // 现在 context 中就有了 main 和 testCases
  if (typeof context.main !== 'function') {
    throw new Error('No valid main function found');
  }
  if (!Array.isArray(context.testCases)) {
    throw new Error('No valid testCases array found');
  }
  return { main: context.main, testCases: context.testCases };
}

/**
 * 运行测试用例
 */
async function runTests(mainFunc, testCases) {
  const errors = [];
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    if (!tc.hasOwnProperty('input') || !tc.hasOwnProperty('expected')) {
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
  return { passed: errors.length === 0, errors };
}

module.exports = async ({ params, body, set }) => {
  const { folder, filename } = params;

  // 路径安全
  if (folder.includes('/') || folder.includes('..') || filename.includes('/') || filename.includes('..')) {
    set.status = 400;
    return { error: 'Invalid folder or filename' };
  }
  if (!filename.endsWith('.js')) {
    set.status = 400;
    return { error: 'Only JavaScript files (.js) are allowed' };
  }
  if (!body.file) {
    set.status = 400;
    return { error: 'No file provided' };
  }

  const file = body.file;
  if (file.size > config.MAX_FILE_SIZE) {
    set.status = 413;
    return { error: `File too large (max ${config.MAX_FILE_SIZE / 1024 / 1024}MB)` };
  }

  const saveDir = path.join(config.BASE_DIR, folder);
  const savePath = path.join(saveDir, filename);

  try {
    await fs.mkdir(saveDir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    const code = buffer.toString('utf-8');
    
    // [START] debug
    console.log('=== Received code ===');
    console.log(code);
    console.log('=== End of code ===');
    // [END] debug

    // 提取并测试
    const { main, testCases } = await extractFromCode(code);
    const { passed, errors } = await runTests(main, testCases);
    if (!passed) {
      set.status = 400;
      return { error: 'Test cases failed', details: errors };
    }

    // 保存文件
    await fs.writeFile(savePath, buffer);
    set.status = 201;
    return { success: true, path: savePath };
  } catch (err) {
    console.error('Upload error:', err);
    set.status = 400; // 多数错误是代码问题
    return { error: err.message };
  }
};
