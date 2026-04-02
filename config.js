// config.js

module.exports = {
  PORT: 3000,
  HOST: '0.0.0.0',           // 监听所有接口
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  EXECUTION_TIMEOUT_MS: 30000,     // 30秒
  BASE_DIR: process.cwd(),         // 根目录
};
