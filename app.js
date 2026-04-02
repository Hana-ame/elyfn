// app.js
const { Elysia, t } = require('elysia');
const config = require('./config');

const uploadHandler = require('./handlers/upload');
const downloadHandler = require('./handlers/download');
const executeHandler = require('./handlers/execute');
const { listFunctions, deleteFunction } = require('./handlers/manage');

const app = new Elysia()
  // 1. 全局拦截与鉴权
  .onBeforeHandle(({ request, set }) => {
    // 只有当 config 里配置了 API_KEY 时才启用强制校验
    if (config.API_KEY) {
      const token = request.headers.get('authorization');
      if (token !== `Bearer ${config.API_KEY}`) {
        set.status = 401;
        return { error: 'Unauthorized. Invalid API Key.' };
      }
    }
  })
  
  // 2. 统一错误处理 (美化报错信息)
  .onError(({ code, error, set }) => {
    if (code === 'NOT_FOUND') return { error: 'Endpoint Not Found' };
    return { error: error.message };
  })

  // 3. 运维管理接口 (新增)
  .get('/manage/list', listFunctions)
  .delete('/manage/:folder/:filename', deleteFunction)

  // 4. 核心业务接口
  .get('/', () => ({ message: 'elyfn FaaS Engine is Running' }))
  .put('/:folder/:filename', uploadHandler, { body: t.Object({ file: t.File() }) })
  .post('/:folder/:filename', executeHandler)
  .get('/:folder/:filename', downloadHandler);

module.exports = app;