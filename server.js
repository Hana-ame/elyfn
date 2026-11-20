// server.js
const { createServer } = require('http');
const { createNodeAdapter } = require('./adapter');
const app = require('./app');
const config = require('./config');
const { cleanupTmpFiles } = require('./utils/cleanupTmp');
const { waitForWorkers, terminateAllWorkers } = require('./utils/runInWorker');

const server = createServer(createNodeAdapter(app));

async function start() {
  // 启动前清理可能因上次异常退出残留的 .tmp-* 文件
  await cleanupTmpFiles(config.BASE_DIR);

  server.listen(config.PORT, config.HOST, () => {
    console.log(`elyfn server listening on http://${config.HOST}:${config.PORT}`);
    console.log(
      `Concurrency: exec=${config.MAX_CONCURRENCY}, test=${config.MAX_TEST_CONCURRENCY}, mem=${config.MAX_WORKER_MEM_MB}MB, timeout=${config.EXECUTION_TIMEOUT_MS}ms`
    );
    if (config.ADMIN_KEY === 'change-me-admin-secret') {
      console.warn('[WARNING] Using default ADMIN_KEY! Set ELYFN_ADMIN_KEY before exposing this service.');
    }
  });
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully...`);

  server.close(async () => {
    await waitForWorkers(config.EXECUTION_TIMEOUT_MS + 1000);
    await terminateAllWorkers();
    await cleanupTmpFiles(config.BASE_DIR);
    console.log('elyfn server stopped cleanly.');
    process.exit(0);
  });

  // 兜底硬超时，防止长连接阻止退出
  setTimeout(async () => {
    await terminateAllWorkers();
    await cleanupTmpFiles(config.BASE_DIR);
    process.exit(1);
  }, config.EXECUTION_TIMEOUT_MS + 3000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
