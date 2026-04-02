// utils/runTests.js

const deepEqual = require('./deepEqual');

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

module.exports = runTests;