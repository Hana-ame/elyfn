// app.js
const { Elysia, t } = require('elysia');
const config = require('./config');

const uploadHandler = require('./handlers/upload');
const downloadHandler = require('./handlers/download');
const executeHandler = require('./handlers/execute');
const { listFunctions, deleteFunction } = require('./handlers/manage');

function getBearerToken(request) {
  const auth = request.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

const app = new Elysia()
  // 1. 读写权限分离拦截器
  .onBeforeHandle(({ request, set }) => {
    const { pathname } = new URL(request.url);
    const method = request.method.toUpperCase();
    const token = getBearerToken(request);

    if (method === 'GET' && pathname === '/') return;

    if (method === 'POST') {
      if (config.EXEC_KEY && token !== config.EXEC_KEY && token !== config.ADMIN_KEY) {
        set.status = 401;
        return { error: 'Unauthorized: invalid execute key' };
      }
      return;
    }

    if (config.ADMIN_KEY && token !== config.ADMIN_KEY) {
      set.status = 403;
      return { error: 'Forbidden: admin key required' };
    }
  })

  // 2. 统一错误处理（5xx 屏蔽内部错误细节，防止信息外泄）
  .onError(({ code, error, set }) => {
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

  // 4. 核心业务接口
  .get('/', () => ({ message: 'elyfn FaaS Engine is Running' }))
  .put('/:folder/:filename', uploadHandler, { body: t.Object({ file: t.File() }) })
  .post('/:folder/:filename', executeHandler)
  .get('/:folder/:filename', downloadHandler);

module.exports = app;
