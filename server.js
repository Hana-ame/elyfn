// server.js
const fs = require('fs');
const path = require('path');
const { createServer } = require('http');
const { createNodeAdapter } = require('./adapter');
const app = require('./app');
const config = require('./config');
const { cleanupTmpFiles } = require('./utils/cleanupTmp');
const { waitForWorkers, terminateAllWorkers } = require('./utils/runInWorker');

const server = createServer(createNodeAdapter(app));
// 防止慢速连接占坑（Slowloris）
server.headersTimeout = 15000;
server.requestTimeout = Math.max(30000, config.EXECUTION_TIMEOUT_MS + 10000);

async function start() {
  // 启动前清理可能因上次异常退出残留的 .tmp-* 文件
  await cleanupTmpFiles(config.BASE_DIR);

  const onListening = (endpointLabel) => {
    console.log(`elyfn server listening on ${endpointLabel}`);
    console.log(
      `Concurrency: exec=${config.MAX_CONCURRENCY}, test=${config.MAX_TEST_CONCURRENCY}, mem=${config.MAX_WORKER_MEM_MB}MB, timeout=${config.EXECUTION_TIMEOUT_MS}ms`
    );
    if (config.ADMIN_KEY === 'change-me-admin-secret') {
      console.warn('[WARNING] Using default ADMIN_KEY! Set ELYFN_ADMIN_KEY before exposing this service.');
    }
  };

  if (config.SOCKET_PATH) {
    fs.mkdirSync(path.dirname(config.SOCKET_PATH), { recursive: true });
    if (fs.existsSync(config.SOCKET_PATH)) {
      fs.unlinkSync(config.SOCKET_PATH);
    }
    server.listen(config.SOCKET_PATH, () => {
      try {
        fs.chmodSync(config.SOCKET_PATH, config.SOCKET_MODE);
      } catch {
        // ignore chmod failures on filesystems that disallow it
      }
      onListening(`unix://${config.SOCKET_PATH}`);
    });
    return;
  }

  server.listen(config.PORT, config.HOST, () => {
    onListening(`http://${config.HOST}:${config.PORT}`);
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
    if (config.SOCKET_PATH) {
      try { fs.unlinkSync(config.SOCKET_PATH); } catch { /* ignore */ }
    }
    console.log('elyfn server stopped cleanly.');
    process.exit(0);
  });

  // 立即关闭空闲 Keep-Alive 连接（如 Nginx 上游长连接），避免停机一直卡到兜底超时
  if (typeof server.closeIdleConnections === 'function') {
    server.closeIdleConnections();
  }

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
