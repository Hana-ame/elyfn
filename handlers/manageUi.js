// handlers/manageUi.js — Self-contained Developer Console HTML for elyfn (/manage/, /admin/)
const WIN_EXEC_CLI_FN = [
  'async function execCli(bin, args, opts) {',
  '  const isWin = process.platform === "win32";',
  '  if (!isWin || /\\.(exe|com)$/i.test(bin)) {',
  '    try { return await execFileAsync(bin, args, opts); }',
  '    catch (e) { if (!isWin || (e.code !== "EINVAL" && e.code !== "ENOENT")) throw e; }',
  '  }',
  '  if ([bin, ...args].some((s) => /[\\r\\n\\0&|<>^%!]/.test(s))) {',
  '    throw new Error("Unsafe shell metacharacters rejected for Windows .cmd wrapper");',
  '  }',
  '  const q = (s) => \'"\' + String(s).replace(/"/g, \'\\\\"\') + \'"\';',
  '  const line = [q(bin), ...args.map(q)].join(" ");',
  '  return execFileAsync("cmd.exe", ["/d", "/s", "/c", \'"\' + line + \'"\'], { ...opts, windowsVerbatimArguments: true });',
  '}',
].join('\n');

const STARTER_TEMPLATES = {
  js: {
    folder: 'demo',
    file: 'hello.js',
    code: [
      'exports.main = async (input) => ({ ok: true, greeting: "hello " + (input?.name || "atlas") });',
      'exports.testCases = [{ input: { name: "ci" }, expected: { ok: true, greeting: "hello ci" } }];',
    ].join('\n'),
  },
  ts: {
    folder: 'demo',
    file: 'typed.ts',
    code: [
      'interface GreetIn { name: string; }',
      'export async function main(input: GreetIn): Promise<{ greeting: string }> {',
      '  return { greeting: `hello ${input.name || "world"}` };',
      '}',
      'export const testCases = [{ input: { name: "ts" }, expected: { greeting: "hello ts" } }];',
    ].join('\n'),
  },
  agy: {
    folder: 'agents',
    file: 'ask_agy.js',
    code: [
      'const { execFile } = require("node:child_process");',
      'const { promisify } = require("node:util");',
      'const execFileAsync = promisify(execFile);',
      WIN_EXEC_CLI_FN,
      'exports.main = async (input) => {',
      '  const bin = process.env.AGY_PATH || "agy";',
      '  const prompt = String(input?.prompt || "").trim();',
      '  if (!prompt) return { ok: false, error: "缺少 input.prompt" };',
      '  try {',
      '    const { stdout, stderr } = await execCli(bin, ["-p", prompt, "--output-format", "json"], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });',
      '    return { ok: true, output: stdout.trim(), stderr: stderr.trim() };',
      '  } catch (err) {',
      '    return { ok: false, error: err.message, hint: "请确认宿主已部署 elyfn、设置 AGY_PATH，并在 ELYFN_WORKER_ENV_ALLOW 允许 HOME (Linux/macOS) 或 USERPROFILE,APPDATA (Windows)" };',
      '  }',
      '};',
      'exports.testCases = [{ input: { prompt: "" }, expected: { ok: false, error: "缺少 input.prompt" } }];',
    ].join('\n'),
  },
  pi: {
    folder: 'agents',
    file: 'ask_pi.js',
    code: [
      'const { execFile } = require("node:child_process");',
      'const { promisify } = require("node:util");',
      'const execFileAsync = promisify(execFile);',
      WIN_EXEC_CLI_FN,
      'exports.main = async (input) => {',
      '  const bin = process.env.PI_PATH || "pi";',
      '  const prompt = String(input?.prompt || "").trim();',
      '  if (!prompt) return { ok: false, error: "缺少 input.prompt" };',
      '  try {',
      '    const { stdout, stderr } = await execCli(bin, ["-p", prompt], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });',
      '    return { ok: true, output: stdout.trim(), stderr: stderr.trim() };',
      '  } catch (err) {',
      '    return { ok: false, error: err.message, hint: "请安装 pi-coding-agent，设置 PI_PATH（Windows 可指向 pi.cmd）及 ELYFN_WORKER_ENV_ALLOW（含 API Key 与 USERPROFILE/HOME）" };',
      '  }',
      '};',
      'exports.testCases = [{ input: { prompt: "" }, expected: { ok: false, error: "缺少 input.prompt" } }];',
    ].join('\n'),
  },
  gh: {
    folder: 'agents',
    file: 'gh_cli.js',
    code: [
      'const { execFile } = require("node:child_process");',
      'const { promisify } = require("node:util");',
      'const execFileAsync = promisify(execFile);',
      WIN_EXEC_CLI_FN,
      'exports.main = async (input) => {',
      '  const bin = process.env.GH_CLI_PATH || "gh";',
      '  const args = Array.isArray(input?.args) && input.args.length ? input.args.map(String) : ["auth", "status"];',
      '  if (!input?.run) return { ok: true, ready: true, bin, args };',
      '  try {',
      '    const { stdout, stderr } = await execCli(bin, args, { timeout: 30000, maxBuffer: 2 * 1024 * 1024 });',
      '    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };',
      '  } catch (err) {',
      '    return { ok: false, error: err.message, hint: "请在宿主机部署 elyfn，设置 GH_CLI_PATH（gh / gh.exe）与 ELYFN_WORKER_ENV_ALLOW=HOME,GH_CONFIG_DIR（Windows 为 USERPROFILE,APPDATA）" };',
      '  }',
      '};',
      'exports.testCases = [{ input: { run: false }, expected: { ok: true, ready: true, bin: process.env.GH_CLI_PATH || "gh", args: ["auth", "status"] } }];',
    ].join('\n'),
  },
};

function renderManageHtml() {
  const safeTemplatesJson = JSON.stringify(STARTER_TEMPLATES).replace(/<\//g, '<\\/');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>elyfn 开发者函数控制台</title>
  <style>
    :root { --bg:#f8fafc; --card:#ffffff; --bd:#cbd5e1; --fg:#0f172a; --muted:#475569; --accent:#7c3aed; --accent-d:#6d28d9; --ok:#059669; --danger:#dc2626; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:ui-sans-serif,system-ui,-apple-system,sans-serif; background:var(--bg); color:var(--fg); }
    header { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; padding:12px 20px; background:#0f172a; color:#fff; }
    header h1 { margin:0; font-size:16px; font-weight:700; }
    header nav { display:flex; align-items:center; gap:8px; font-size:12px; }
    header nav a { color:#cbd5e1; text-decoration:none; padding:5px 10px; border:1px solid #334155; border-radius:6px; }
    header nav a:hover { background:#1e293b; color:#fff; }
    .shell { max-width:1280px; margin:16px auto; padding:0 16px 32px; display:grid; gap:14px; }
    .card { background:var(--card); border:1px solid var(--bd); border-radius:10px; padding:14px; }
    .row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
    .workspace { display:grid; grid-template-columns:260px 1fr; gap:14px; align-items:start; }
    @media (max-width:900px) { .workspace { grid-template-columns:1fr; } }
    input, select, textarea { width:100%; padding:8px 10px; border:1px solid var(--bd); border-radius:7px; font-size:13px; background:#fff; color:var(--fg); }
    textarea { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; line-height:1.5; }
    button { border:0; border-radius:7px; padding:8px 13px; font-size:12.5px; font-weight:600; cursor:pointer; background:var(--accent); color:#fff; }
    button:hover { background:var(--accent-d); }
    button.ok { background:var(--ok); }
    button.sec { background:#e2e8f0; color:#0f172a; }
    button.del { background:var(--danger); }
    .pill { display:inline-block; padding:3px 8px; border-radius:99px; font-size:11px; font-weight:700; background:#ede9fe; color:#5b21b6; }
    .fn-item { display:flex; justify-content:space-between; align-items:center; width:100%; text-align:left; background:#f8fafc; color:var(--fg); border:1px solid #e2e8f0; margin-bottom:6px; padding:7px 10px; font-family:ui-monospace,monospace; font-size:12px; }
    .fn-item.active { border-color:var(--accent); background:#f5f3ff; color:#5b21b6; }
    pre { margin:0; padding:10px; border-radius:7px; background:#0f172a; color:#e2e8f0; font-size:12px; overflow:auto; max-height:240px; }
    .muted { font-size:12px; color:var(--muted); }
  </style>
</head>
<body>
  <header>
    <div class="row">
      <h1>elyfn 开发者函数控制台</h1>
      <span class="pill" id="authBadge">未连接</span>
    </div>
    <nav>
      <a href="/admin/">前往 git-gateway 管理页</a>
      <a href="/">返回 Atlas 用户画布</a>
    </nav>
  </header>
  <main class="shell">
    <section class="card">
      <div class="row">
        <div style="flex:1;min-width:220px;">
          <input id="adminKey" type="password" placeholder="输入 ELYFN_ADMIN_KEY（仅存当前会话 sessionStorage）" />
        </div>
        <div style="width:200px;">
          <input id="execKey" type="password" placeholder="可选 ELYFN_EXEC_KEY" />
        </div>
        <button id="connectBtn" type="button">连接并拉取列表</button>
        <button id="logoutBtn" type="button" class="sec">清除密钥</button>
      </div>
      <div id="topStatus" class="muted" style="margin-top:8px;">输入管理员密钥后即可浏览、新建、编译测试（testCases）并部署 JS/TS 函数。</div>
    </section>

    <div class="workspace">
      <aside class="card">
        <div class="row" style="justify-content:space-between;margin-bottom:10px;">
          <strong>已部署函数</strong>
          <button id="refreshBtn" type="button" class="sec">刷新</button>
        </div>
        <div style="margin-bottom:10px;">
          <select id="tplSelect">
            <option value="">-- 从模板快速新建 --</option>
            <option value="js">JS 基础函数 (带 testCases)</option>
            <option value="ts">TypeScript 类型函数 (.ts)</option>
            <option value="agy">宿主机 agy Agent 调用模板</option>
            <option value="pi">宿主机 pi Agent 调用模板</option>
            <option value="gh">宿主机 gh CLI 调用模板</option>
          </select>
        </div>
        <div id="fnList" class="muted">尚未加载…</div>
      </aside>

      <section class="card" style="display:grid;gap:12px;">
        <div class="row">
          <div style="width:150px;"><input id="folderInput" placeholder="目录 (如 tools)" value="demo" /></div>
          <div style="width:190px;"><input id="fileInput" placeholder="文件名 (hello.js / ts)" value="hello.js" /></div>
          <button id="saveBtn" type="button">上传编译并部署 (PUT)</button>
          <button id="deleteBtn" type="button" class="del">删除函数</button>
        </div>
        <textarea id="codeEditor" rows="15" spellcheck="false" placeholder="编写 module.exports = { main, testCases } ..."></textarea>

        <div class="row" style="justify-content:space-between;">
          <strong>调用测试 (POST /:folder/:fn)</strong>
          <div class="row">
            <label class="row muted" style="gap:4px;"><input id="asyncCheck" type="checkbox" style="width:auto;" /> 异步 ?async=1 轮询 /jobs/:id</label>
            <button id="runBtn" type="button" class="ok">执行测试</button>
            <button id="jobsBtn" type="button" class="sec">刷新 /jobs</button>
          </div>
        </div>
        <textarea id="payloadInput" rows="3">{ "name": "world" }</textarea>
        <pre id="outputBox">等待操作…</pre>
      </section>
    </div>
  </main>
  <script>
    const K_ADMIN = 'elyfn_admin_key', K_EXEC = 'elyfn_exec_key';
    const $ = (id) => document.getElementById(id);
    const adminKey = () => sessionStorage.getItem(K_ADMIN) || '';
    const execKey = () => sessionStorage.getItem(K_EXEC) || '';

    const TEMPLATES = ${safeTemplatesJson};

    function showOut(obj) {
      $('outputBox').textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    }

    async function refreshList() {
      if (!adminKey()) return;
      try {
        const res = await fetch('/manage/list', { headers: { Authorization: 'Bearer ' + adminKey() } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
        $('authBadge').textContent = '已认证';
        const box = $('fnList');
        box.innerHTML = '';
        const entries = Object.entries(data.functions || {});
        if (entries.length === 0) { box.textContent = '暂无已部署函数，可从上方模板新建。'; return; }
        for (const [folder, files] of entries) {
          for (const fname of files) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'fn-item';
            btn.textContent = folder + '/' + fname;
            btn.onclick = () => loadSource(folder, fname, btn);
            box.appendChild(btn);
          }
        }
      } catch (e) {
        $('authBadge').textContent = '鉴权失败';
        showOut({ error: e.message });
      }
    }

    async function loadSource(folder, fname, btn) {
      document.querySelectorAll('.fn-item').forEach((el) => el.classList.remove('active'));
      if (btn) btn.classList.add('active');
      $('folderInput').value = folder;
      $('fileInput').value = fname;
      try {
        const res = await fetch('/' + folder + '/' + fname, { headers: { Authorization: 'Bearer ' + adminKey() } });
        const txt = await res.text();
        if (!res.ok) throw new Error(txt);
        $('codeEditor').value = txt;
        showOut({ loaded: folder + '/' + fname, bytes: txt.length });
      } catch (e) { showOut({ error: e.message }); }
    }

    $('tplSelect').onchange = () => {
      const t = TEMPLATES[$('tplSelect').value];
      if (!t) return;
      $('folderInput').value = t.folder;
      $('fileInput').value = t.file;
      $('codeEditor').value = t.code;
    };

    $('connectBtn').onclick = () => {
      sessionStorage.setItem(K_ADMIN, $('adminKey').value.trim());
      sessionStorage.setItem(K_EXEC, $('execKey').value.trim());
      refreshList();
    };
    $('logoutBtn').onclick = () => {
      sessionStorage.removeItem(K_ADMIN);
      sessionStorage.removeItem(K_EXEC);
      $('adminKey').value = '';
      $('execKey').value = '';
      $('authBadge').textContent = '未连接';
    };
    $('refreshBtn').onclick = refreshList;

    $('saveBtn').onclick = async () => {
      const folder = $('folderInput').value.trim();
      const file = $('fileInput').value.trim();
      const fd = new FormData();
      fd.append('file', new Blob([$('codeEditor').value], { type: 'text/plain' }), file);
      showOut('正在上传编译并运行 testCases…');
      const res = await fetch('/' + folder + '/' + file, {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + adminKey() },
        body: fd,
      });
      const data = await res.json().catch(() => ({ status: res.status }));
      showOut(data);
      if (res.ok) refreshList();
    };

    $('deleteBtn').onclick = async () => {
      const folder = $('folderInput').value.trim();
      const file = $('fileInput').value.trim();
      const res = await fetch('/manage/' + folder + '/' + file, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + adminKey() },
      });
      showOut(await res.json().catch(() => ({ status: res.status })));
      refreshList();
    };

    $('runBtn').onclick = async () => {
      const folder = $('folderInput').value.trim();
      const fn = $('fileInput').value.trim().replace(/\.(js|ts)$/i, '');
      const headers = { 'Content-Type': 'application/json' };
      const k = execKey() || adminKey();
      if (k) headers.Authorization = 'Bearer ' + k;
      const url = '/' + folder + '/' + fn + ($('asyncCheck').checked ? '?async=1' : '');
      const res = await fetch(url, { method: 'POST', headers, body: $('payloadInput').value || '{}' });
      const data = await res.json().catch(() => ({ status: res.status }));
      showOut(data);
      if (res.status === 202 && data.statusUrl) {
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          const jr = await fetch(data.statusUrl, { headers: k ? { Authorization: 'Bearer ' + k } : {} }).then((r) => r.json());
          showOut(jr);
          if (jr.status === 'completed' || jr.status === 'failed') break;
        }
      }
    };

    $('jobsBtn').onclick = async () => {
      const k = execKey() || adminKey();
      const res = await fetch('/jobs', { headers: k ? { Authorization: 'Bearer ' + k } : {} });
      showOut(await res.json().catch(() => ({ status: res.status })));
    };

    $('adminKey').value = adminKey();
    $('execKey').value = execKey();
    if (adminKey()) refreshList();
  </script>
</body>
</html>`;
}

module.exports = { renderManageHtml, STARTER_TEMPLATES };
