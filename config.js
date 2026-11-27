// config.js
const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;

/**
 * 解析 .env 中 `=` 右侧的值：
 * - 支持单/双引号包裹（引号内的 # 与空格原样保留，双引号内支持 \" 与 \\ 转义）；
 * - 未加引号时剥离行内注释，但要求 # 前有空白：`8   # 注释` → `8`，
 *   而 `abc#123` 视为值的一部分（避免密码里的 # 被误吃）；
 * - 引号未闭合时退回未加引号的处理方式，不静默吞掉整行。
 */
function parseEnvValue(raw) {
  const val = raw.trim();
  const quote = val[0];
  if (quote === '"' || quote === "'") {
    let end = -1;
    for (let i = 1; i < val.length; i++) {
      if (val[i] === '\\' && quote === '"') { i++; continue; }
      if (val[i] === quote) { end = i; break; }
    }
    if (end > 0) {
      const inner = val.slice(1, end);
      // 与扫描时保持一致：双引号内的 \" 与 \\ 是转义写法，取值时还原；其它反斜杠原样保留
      return quote === '"' ? inner.replace(/\\(["\\])/g, '$1') : inner;
    }
  }
  const hashIdx = val.search(/(^|\s)#/);
  return hashIdx >= 0 ? val.slice(0, hashIdx).trim() : val;
}

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
      const val = parseEnvValue(line.slice(eqIdx + 1));
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch (err) {
    console.warn('[WARNING] Failed to load .env file:', err.message);
  }
}

loadDotEnv();

function parseCsvList(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

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
  ASYNC_TIMEOUT_MS: Number(process.env.ELYFN_ASYNC_TIMEOUT_MS) || 300000,
  JOB_TTL_MS: Number(process.env.ELYFN_JOB_TTL_MS) || 1800000,
  MAX_JOBS: Number(process.env.ELYFN_MAX_JOBS) || 200,

  // 函数存储目录（默认位于项目根目录，而非 process.cwd()）
  BASE_DIR: process.env.ELYFN_BASE_DIR || path.join(ROOT_DIR, 'functions'),

  // 读写权限分离：
  ADMIN_KEY: process.env.ELYFN_ADMIN_KEY || 'change-me-admin-secret',
  EXEC_KEY: process.env.ELYFN_EXEC_KEY || '',

  // CORS 配置（默认 * 方便子域名/画布前端通过 Bearer Token 调用；生产可收紧为指定 Origin）
  CORS_ORIGIN: process.env.ELYFN_CORS_ORIGIN !== undefined ? process.env.ELYFN_CORS_ORIGIN : '*',

  // Worker 环境变量白名单（默认仅透传安全基础变量与 ELYFN_FN_* 前缀变量，隔离宿主密钥）
  WORKER_ENV_ALLOW: parseCsvList(process.env.ELYFN_WORKER_ENV_ALLOW),

  parseEnvValue,
};
