const { Elysia, t } = require('elysia');
const uploadHandler = require('./handlers/upload');
const downloadHandler = require('./handlers/download');
const executeHandler = require('./handlers/execute');

const app = new Elysia()
  // 根路径
  .get('/', () => 'Function Hosting Server')

  // 上传函数 (必须通过测试)
  .put('/:folder/:filename', uploadHandler, {
    body: t.Object({ file: t.File() })
  })

  // 下载函数源码
  .get('/:folder/:filename', downloadHandler)

  // 执行函数
  .post('/:folder/:filename', executeHandler);

module.exports = app;
