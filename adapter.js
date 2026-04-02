const { createServer } = require('http');

/**
 * 将 Node.js 请求转换为 Web 标准 Request
 */
function toWebRequest(req) {
  const protocol = req.socket.encrypted ? 'https' : 'http';
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url, `${protocol}://${host}`);
  return new Request(url, {
    method: req.method,
    headers: req.headers,
    body: (req.method !== 'GET' && req.method !== 'HEAD') ? req : undefined,
  });
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
 * 创建适配器：将 Elysia 应用包装为 Node.js 请求处理函数
 */
function createNodeAdapter(app) {
  return async (nodeReq, nodeRes) => {
    try {
      const webReq = toWebRequest(nodeReq);
      const webRes = await app.fetch(webReq);
      await writeNodeResponse(webRes, nodeRes);
    } catch (err) {
      console.error('Unhandled error:', err);
      nodeRes.statusCode = 500;
      nodeRes.end('Internal Server Error');
    }
  };
}

module.exports = { createNodeAdapter };
