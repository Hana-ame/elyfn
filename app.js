// app.js
const crypto = require('crypto');
const { Elysia, t } = require('elysia');
const config = require('./config');

const uploadHandler = require('./handlers/upload');
const downloadHandler = require('./handlers/download');
const executeHandler = require('./handlers/execute');
const { getJobStatus, listJobStatuses } = require('./handlers/jobs');
const { listFunctions, getCatalog, deleteFunction } = require('./handlers/manage');
const { renderManageHtml } = require('./handlers/manageUi');

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
  set.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, X-Elyfn-Async, Prefer';
  set.headers['Access-Control-Max-Age'] = '600';
}

function serveManageUi({ set }) {
  return new Response(renderManageHtml(), {
    status: 200,
    headers: {
      ...set.headers,
      'content-type': 'text/html; charset=utf-8',
    },
  });
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

    if (
      method === 'GET' &&
      (pathname === '/' || pathname === '/manage' || pathname === '/manage/' || pathname === '/admin' || pathname === '/admin/')
    ) {
      return;
    }

    // 执行接口（POST）、只读函数目录（GET /catalog）与异步任务轮询（GET /jobs*）：由 EXEC_KEY 保护（未配置则公开；ADMIN_KEY 通用）
    if (
      method === 'POST' ||
      (method === 'GET' && (pathname === '/catalog' || pathname === '/jobs' || pathname.startsWith('/jobs/')))
    ) {
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

  // 3. 运维管理接口（仅 ADMIN_KEY；静态外壳页面免密渲染，不含任何密钥与数据）
  .get('/manage', serveManageUi)
  .get('/manage/', serveManageUi)
  .get('/admin', serveManageUi)
  .get('/admin/', serveManageUi)
  .get('/manage/list', listFunctions)
  .delete('/manage/:folder/:filename', deleteFunction)

  // 4. 只读函数目录与异步任务轮询接口（与 POST 执行权限一致，不暴露源码）
  .get('/catalog', getCatalog)
  .get('/jobs', listJobStatuses)
  .get('/jobs/:id', getJobStatus)

  // 5. 核心业务接口
  .get('/', () => ({ message: 'elyfn FaaS Engine is Running' }))
  .put('/:folder/:filename', uploadHandler, { body: t.Object({ file: t.File() }) })
  .post('/:folder/:filename', executeHandler)
  .get('/:folder/:filename', downloadHandler);

module.exports = app;
module.exports.safeTokenEqual = safeTokenEqual;
