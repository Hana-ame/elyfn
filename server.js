const { createServer } = require('http');
const { createNodeAdapter } = require('./adapter');
const app = require('./app');
const config = require('./config');

const server = createServer(createNodeAdapter(app));

server.listen(config.PORT, config.HOST, () => {
  console.log(`Server listening on http://${config.HOST}:${config.PORT}`);
});
