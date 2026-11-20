// utils/validator.js
// 仅允许字母、数字、下划线、横杠，防止路径遍历

function isValidFolder(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9_-]+$/.test(name);
}

// 上传与下载允许 .js 或 .ts
function isValidSourceFilename(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9_-]+\.(js|ts)$/.test(name);
}

// 执行与删除允许 square.js、square.ts 或不带后缀的 square
function isValidFuncName(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9_-]+(\.(js|ts))?$/.test(name);
}

function getBaseName(filename) {
  return filename.replace(/\.(js|ts)$/, '');
}

module.exports = {
  isValidFolder,
  isValidSourceFilename,
  isValidFuncName,
  getBaseName,
};
