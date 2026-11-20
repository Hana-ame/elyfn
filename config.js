// config.js
const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;

/**
 * 零依赖加载项目根目录（__dirname）下的 .env 文件（不覆盖已有的系统/Docker 环境变量）
 * 从任意工作目录执行 `node /opt/elyfn/index.js` 都能正确找到 .env 与 functions 目录
 */
function loadDotEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch (err) {
    console.warn('[WARNING] Failed to load .env file:', err.message);
  }
}

loadDotEnv();

module.exports = {
  ROOT_DIR,
  PORT: Number(process.env.ELYFN_PORT) || 3000,
  HOST: process.env.ELYFN_HOST || '0.0.0.0',

  // 上传文件大小限制（默认 2MB）与执行请求体大小限制（默认 1MB）
  MAX_FILE_SIZE: Number(process.env.ELYFN_MAX_FILE_SIZE) || 2 * 1024 * 1024,
  MAX_BODY_SIZE: Number(process.env.ELYFN_MAX_BODY_SIZE) || 1 * 1024 * 1024,

  // Worker 并发与资源限制（公网执行与管理测试分离，避免公网打满饿死管理员上传）
  MAX_CONCURRENCY: Number(process.env.ELYFN_MAX_CONCURRENCY) || 8,
  MAX_TEST_CONCURRENCY: Number(process.env.ELYFN_MAX_TEST_CONCURRENCY) || 2,
  MAX_WORKER_MEM_MB: Number(process.env.ELYFN_MAX_WORKER_MEM_MB) || 64,
  EXECUTION_TIMEOUT_MS: Number(process.env.ELYFN_TIMEOUT_MS) || 5000,

  // 函数存储目录（默认位于项目根目录，而非 process.cwd()）
  BASE_DIR: process.env.ELYFN_BASE_DIR || path.join(ROOT_DIR, 'functions'),

  // 读写权限分离：
  ADMIN_KEY: process.env.ELYFN_ADMIN_KEY || 'change-me-admin-secret',
  EXEC_KEY: process.env.ELYFN_EXEC_KEY || '',
};
