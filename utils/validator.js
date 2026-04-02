// utils/validator.js
// 仅允许字母、数字、下划线、横杠
function isValidFolder(name) {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

function isValidFilename(name) {
  return /^[a-zA-Z0-9_-]+\.js$/.test(name);
}

module.exports = { isValidFolder, isValidFilename };