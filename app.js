// app.js
const crypto = require('crypto');
const { Elysia, t } = require('elysia');
const config = require('./config');

const uploadHandler = require('./handlers/upload');
const downloadHandler = require('./handlers/download');
const executeHandler = require('./handlers/execute');
const { listFunctions, getCatalog, deleteFunction } = require('./handlers/manage');

function getBearerToken(request) {
  const auth = request.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

function safeTokenEqual(provided, expected) {
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided), 'utf-8');
  const b = Buffer.from(String(expected), 'utf-8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function applyCorsHeaders(set) {
  if (!config.CORS_ORIGIN) return;
  set.headers['Access-Control-Allow-Origin'] = config.CORS_ORIGIN;
  set.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
  set.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
  set.headers['Access-Control-Max-Age'] = '600';
}

const app = new Elysia()
  // 1. CORS 预检与读写权限分离拦截器（普通人仅可调用与查看只读目录，仅 Admin 可上传/下载源码/删除）
  .onBeforeHandle(({ request, set }) => {
    applyCorsHeaders(set);
    const { pathname } = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') {
      set.status = 204;
      return '';
    }

    const token = getBearerToken(request);

    if (method === 'GET' && pathname === '/') return;

    // 执行接口（POST）与只读函数目录（GET /catalog）：由 EXEC_KEY 保护（未配置则公开；ADMIN_KEY 通用）
    if (method === 'POST' || (method === 'GET' && pathname === '/catalog')) {
      if (
        config.EXEC_KEY &&
        !safeTokenEqual(token, config.EXEC_KEY) &&
        !safeTokenEqual(token, config.ADMIN_KEY)
      ) {
        set.status = 401;
        return { error: 'Unauthorized: invalid execute key' };
      }
      return;
    }

    // 其余写/管理/源码下载接口一律强制校验 ADMIN_KEY
    if (!config.ADMIN_KEY || !safeTokenEqual(token, config.ADMIN_KEY)) {
      set.status = 403;
      return { error: 'Forbidden: admin key required' };
    }
  })

  // 2. 统一错误处理（5xx 屏蔽内部错误细节，防止信息外泄）
  .onError(({ code, error, set }) => {
    applyCorsHeaders(set);
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { error: 'Endpoint Not Found' };
    }
    const status = (error && error.status) || (typeof set.status === 'number' ? set.status : 500);
    set.status = status;
    if (status >= 500 && status !== 504) {
      console.error('Server error:', error);
      return { error: 'Internal Server Error' };
    }
    return { error: error ? error.message : 'Request Error' };
  })

  // 3. 运维管理接口（仅 ADMIN_KEY）
  .get('/manage/list', listFunctions)
  .delete('/manage/:folder/:filename', deleteFunction)

  // 4. 只读函数目录接口（与 POST 执行权限一致，不暴露源码）
  .get('/catalog', getCatalog)

  // 5. 核心业务接口
  .get('/', () => ({ message: 'elyfn FaaS Engine is Running' }))
  .put('/:folder/:filename', uploadHandler, { body: t.Object({ file: t.File() }) })
  .post('/:folder/:filename', executeHandler)
  .get('/:folder/:filename', downloadHandler);

module.exports = app;
module.exports.safeTokenEqual = safeTokenEqual;
