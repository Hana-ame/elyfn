// config.js
const path = require('path');

module.exports = {
  PORT: 3000,
  HOST: '0.0.0.0',
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  EXECUTION_TIMEOUT_MS: 5000,       // 缩短为5秒：使用 Worker 后超时将强制杀死线程，5秒已非常充裕
  BASE_DIR: path.join(process.cwd(), 'functions'), // 推荐使用专门的文件夹存放代码
  API_KEY: '',                      // 可填入 'my-secret' 来开启 HTTP Header 鉴权
};