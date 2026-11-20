// utils/deepEqual.js
const { isDeepStrictEqual } = require('util');

// 直接使用 Node.js 内置深度严格比较：正确处理 Date、RegExp、Map、Set、NaN 与循环引用
module.exports = isDeepStrictEqual;
