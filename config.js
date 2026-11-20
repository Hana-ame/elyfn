// config.js
const fs = require('fs');
const path = require('path');

/**
 * 零依赖加载同目录 .env 文件（不覆盖已有的系统/Docker 环境变量）
 * 兼容 Termux / Linux / macOS / Windows，无需依赖 shell 脚本
 */
function loadDotEnv() {
  const envPath = path.join(process.cwd(), '.env');
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
  PORT: Number(process.env.ELYFN_PORT) || 3000,
  HOST: process.env.ELYFN_HOST || '0.0.0.0',

  // 上传文件大小限制（默认 2MB）与执行请求体大小限制（默认 1MB）
  MAX_FILE_SIZE: Number(process.env.ELYFN_MAX_FILE_SIZE) || 2 * 1024 * 1024,
  MAX_BODY_SIZE: Number(process.env.ELYFN_MAX_BODY_SIZE) || 1 * 1024 * 1024,

  // Worker 并发与资源限制（Termux 建议设 MAX_CONCURRENCY=2~4, MAX_WORKER_MEM_MB=32~48）
  MAX_CONCURRENCY: Number(process.env.ELYFN_MAX_CONCURRENCY) || 8,
  MAX_WORKER_MEM_MB: Number(process.env.ELYFN_MAX_WORKER_MEM_MB) || 64,
  EXECUTION_TIMEOUT_MS: Number(process.env.ELYFN_TIMEOUT_MS) || 5000,

  // 函数存储目录
  BASE_DIR: process.env.ELYFN_BASE_DIR || path.join(process.cwd(), 'functions'),

  // 读写权限分离：
  // ADMIN_KEY 用于上传、删除、列出函数与下载源码（强烈建议通过 .env 或环境变量设置）
  ADMIN_KEY: process.env.ELYFN_ADMIN_KEY || 'change-me-admin-secret',
  // EXEC_KEY 用于 POST 执行函数；留空表示允许公开调用
  EXEC_KEY: process.env.ELYFN_EXEC_KEY || '',
};
