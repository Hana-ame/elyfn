// adapter.js
const config = require('./config');

/**
 * 将 Node.js 请求转换为 Web 标准 Request
 */
function toWebRequest(req) {
  const protocol = req.socket.encrypted ? 'https' : 'http';
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url, `${protocol}://${host}`);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const init = {
    method: req.method,
    headers: req.headers,
  };
  if (hasBody) {
    init.body = req;
    init.duplex = 'half';
  }
  return new Request(url, init);
}

/**
 * 将 Web Response 写回 Node.js 响应
 */
async function writeNodeResponse(webRes, nodeRes) {
  nodeRes.statusCode = webRes.status;
  for (const [key, value] of webRes.headers) {
    nodeRes.setHeader(key, value);
  }
  const buffer = Buffer.from(await webRes.arrayBuffer());
  nodeRes.end(buffer);
}

/**
 * 创建适配器：将 Elysia 应用包装为 Node.js 请求处理函数，并拦截超大请求体
 */
function createNodeAdapter(app) {
  return async (nodeReq, nodeRes) => {
    try {
      const contentLength = Number(nodeReq.headers['content-length'] || 0);
      const limit = nodeReq.method === 'PUT' ? config.MAX_FILE_SIZE : config.MAX_BODY_SIZE;
      if (contentLength > limit) {
        nodeRes.statusCode = 413;
        nodeRes.setHeader('Content-Type', 'application/json');
        nodeRes.end(JSON.stringify({ error: `Payload too large (limit: ${limit} bytes)` }));
        return;
      }

      const webReq = toWebRequest(nodeReq);
      const webRes = await app.fetch(webReq);
      await writeNodeResponse(webRes, nodeRes);
    } catch (err) {
      console.error('Unhandled error:', err);
      nodeRes.statusCode = 500;
      nodeRes.setHeader('Content-Type', 'application/json');
      nodeRes.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  };
}

module.exports = { createNodeAdapter };
