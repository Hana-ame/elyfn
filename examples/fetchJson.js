// examples/fetchJson.js
const ALLOWED_HOSTS = ["api.github.com", "httpbin.org"];

const testCases = [
  { input: {}, expected: { error: "url is required" } },
  { input: { url: "http://127.0.0.1:3000/" }, expected: { error: "host not allowed" } },
];

async function main(input) {
  if (!input?.url) return { error: "url is required" };

  const parsed = new URL(input.url);
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return { error: "host not allowed" };
  }

  const res = await fetch(parsed.toString(), {
    headers: { "User-Agent": "elyfn-worker" },
  });
  return { status: res.status, data: await res.json() };
}

module.exports = { main, testCases };
