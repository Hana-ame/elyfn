// adapter.js
const config = require('./config');

// Multipart 表单边界与头部预留空间（64KB），避免刚好等于 MAX_FILE_SIZE 的文件被提前 413 拦截
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

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

async function writeNodeResponse(webRes, nodeRes) {
  nodeRes.statusCode = webRes.status;
  for (const [key, value] of webRes.headers) {
    nodeRes.setHeader(key, value);
  }
  const buffer = Buffer.from(await webRes.arrayBuffer());
  nodeRes.end(buffer);
}

function createNodeAdapter(app) {
  return async (nodeReq, nodeRes) => {
    try {
      const contentLength = Number(nodeReq.headers['content-length'] || 0);
      const limit =
        nodeReq.method === 'PUT'
          ? config.MAX_FILE_SIZE + MULTIPART_OVERHEAD_BYTES
          : config.MAX_BODY_SIZE;

      if (contentLength > limit) {
        nodeRes.statusCode = 413;
        nodeRes.setHeader('Content-Type', 'application/json');
        nodeRes.end(JSON.stringify({ error: 'Payload too large' }));
        return;
      }

      const webReq = toWebRequest(nodeReq);
      const webRes = await app.fetch(webReq);
      await writeNodeResponse(webRes, nodeRes);
    } catch (err) {
      console.error('Unhandled adapter error:', err);
      nodeRes.statusCode = 500;
      nodeRes.setHeader('Content-Type', 'application/json');
      nodeRes.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  };
}

module.exports = { createNodeAdapter };
