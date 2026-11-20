// server.js
const { createServer } = require('http');
const { createNodeAdapter } = require('./adapter');
const app = require('./app');
const config = require('./config');

const server = createServer(createNodeAdapter(app));

server.listen(config.PORT, config.HOST, () => {
  console.log(`elyfn server listening on http://${config.HOST}:${config.PORT}`);
  console.log(`Concurrency limit: ${config.MAX_CONCURRENCY}, Worker mem: ${config.MAX_WORKER_MEM_MB}MB, Timeout: ${config.EXECUTION_TIMEOUT_MS}ms`);
  if (config.ADMIN_KEY === 'change-me-admin-secret') {
    console.warn('[WARNING] Using default ADMIN_KEY! Set ELYFN_ADMIN_KEY before exposing this service.');
  }
});
