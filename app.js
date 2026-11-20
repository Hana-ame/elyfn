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

    // 健康检查接口放行
    if (method === 'GET' && pathname === '/') return;

    // 执行接口（POST /:folder/:filename）：公开或校验 EXEC_KEY（ADMIN_KEY 通用）
    if (method === 'POST') {
      if (config.EXEC_KEY && token !== config.EXEC_KEY && token !== config.ADMIN_KEY) {
        set.status = 401;
        return { error: 'Unauthorized: invalid execute key' };
      }
      return;
    }

    // 其余接口（PUT 上传、DELETE 删除、GET 列表/源码下载）统一要求 ADMIN_KEY
    if (config.ADMIN_KEY && token !== config.ADMIN_KEY) {
      set.status = 403;
      return { error: 'Forbidden: admin key required' };
    }
  })

  // 2. 统一错误处理
  .onError(({ code, error, set }) => {
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { error: 'Endpoint Not Found' };
    }
    if (error && error.status) {
      set.status = error.status;
    }
    return { error: error ? error.message : 'Internal Server Error' };
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
