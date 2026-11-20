// examples/fetchJson.js
// 安全示例：仅允许 HTTPS + 严格域名白名单 + 禁止跟随重定向（防止通过 302 绕过 SSRF 校验）

const ALLOWED_HOSTS = ['api.github.com'];

const testCases = [
  { input: {}, expected: { error: 'url is required' } },
  { input: { url: 'http://api.github.com/' }, expected: { error: 'only https is allowed' } },
  { input: { url: 'https://127.0.0.1:3000/' }, expected: { error: 'host not allowed' } },
];

async function main(input) {
  if (!input?.url) return { error: 'url is required' };

  let parsed;
  try {
    parsed = new URL(input.url);
  } catch {
    return { error: 'invalid url' };
  }

  if (parsed.protocol !== 'https:') {
    return { error: 'only https is allowed' };
  }
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return { error: 'host not allowed' };
  }

  // redirect: 'error' 阻止任何 3xx 跳转到内网地址
  const res = await fetch(parsed.toString(), {
    redirect: 'error',
    headers: { 'User-Agent': 'elyfn-worker' },
  });
  return { status: res.status, data: await res.json() };
}

module.exports = { main, testCases };
