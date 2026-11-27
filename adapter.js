// adapter.js
const { Transform } = require('stream');
const config = require('./config');

// Multipart 表单边界与头部预留空间（64KB），避免刚好等于 MAX_FILE_SIZE 的文件被提前 413 拦截
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

class PayloadTooLargeError extends Error {
  constructor(limit) {
    super(`Payload too large (max ${limit} bytes)`);
    this.status = 413;
  }
}

/**
 * 流式字节计数限制器：同时防御带 Content-Length 与 Transfer-Encoding: chunked 的超大请求体，
 * 防止绕过头部校验导致内存打爆。
 */
function createByteLimitStream(limit) {
  let received = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > limit) {
        callback(new PayloadTooLargeError(limit));
        return;
      }
      callback(null, chunk);
    },
  });
}

function toWebRequest(req, limit) {
  const protocol = req.socket && req.socket.encrypted ? 'https' : 'http';
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url, `${protocol}://${host}`);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const init = {
    method: req.method,
    headers: req.headers,
  };
  if (hasBody) {
    const limiter = createByteLimitStream(limit);
    req.pipe(limiter);
    init.body = limiter;
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

      const webReq = toWebRequest(nodeReq, limit);
      const webRes = await app.fetch(webReq);
      await writeNodeResponse(webRes, nodeRes);
    } catch (err) {
      const isTooLarge =
        err instanceof PayloadTooLargeError ||
        (err && err.cause instanceof PayloadTooLargeError) ||
        (err && err.status === 413);
      if (isTooLarge) {
        if (!nodeRes.headersSent) {
          nodeRes.statusCode = 413;
          nodeRes.setHeader('Content-Type', 'application/json');
          nodeRes.end(JSON.stringify({ error: 'Payload too large' }));
        }
        nodeReq.destroy();
        return;
      }
      console.error('Unhandled adapter error:', err);
      if (!nodeRes.headersSent) {
        nodeRes.statusCode = 500;
        nodeRes.setHeader('Content-Type', 'application/json');
        nodeRes.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    }
  };
}

module.exports = { createNodeAdapter, createByteLimitStream, PayloadTooLargeError };
