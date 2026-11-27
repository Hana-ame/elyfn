// utils/compileTs.js
const { spawn } = require('child_process');
const nodeModule = require('module');

function runSystemEsbuildCli(tsCode) {
  return new Promise((resolve, reject) => {
    const bin = process.env.ESBUILD_BINARY_PATH || 'esbuild';
    const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin);
    const child = spawn(bin, ['--loader=ts', '--format=cjs', '--target=node18'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: useShell,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    // 防止子进程提前退出导致 stdin 写入触发未捕获 EPIPE 崩溃主进程
    child.stdin.on('error', () => {});

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error('System esbuild CLI timed out'));
    }, 10000);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf-8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf-8'); });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr.trim() || `esbuild CLI exited with code ${code}`));
      }
    });

    child.stdin.end(tsCode);
  });
}

/**
 * 4 级自动降级 TypeScript 编译链（兼容 Termux / ARM / 低配设备）：
 * 1. npm 原生 esbuild
 * 2. 系统 esbuild CLI（Termux 可通过 `pkg install esbuild` 安装）
 * 3. 纯 WASM 版 esbuild-wasm（零原生二进制依赖）
 * 4. Node.js 内置 module.stripTypeScriptTypes（仅支持可擦除类型 + CommonJS 导出）
 */
async function compileTs(rawCode, filename = 'function.ts') {
  // 1. 优先尝试 npm 安装的 esbuild
  try {
    const esbuild = require('esbuild');
    const transformed = await esbuild.transform(rawCode, {
      loader: 'ts',
      format: 'cjs',
      target: 'node18',
      sourcefile: filename,
    });
    return { code: transformed.code, compiler: 'esbuild' };
  } catch (err) {
    if (err.errors && Array.isArray(err.errors)) throw err;
  }

  // 2. 尝试系统 PATH 中的 esbuild 二进制（如 Termux 的 `pkg install esbuild`）
  try {
    const code = await runSystemEsbuildCli(rawCode);
    return { code, compiler: 'esbuild-cli' };
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  // 3. 尝试纯 WebAssembly 版 esbuild-wasm
  try {
    const esbuildWasm = require('esbuild-wasm');
    const transformed = await esbuildWasm.transform(rawCode, {
      loader: 'ts',
      format: 'cjs',
      target: 'node18',
      sourcefile: filename,
    });
    return { code: transformed.code, compiler: 'esbuild-wasm' };
  } catch (err) {
    if (err.errors && Array.isArray(err.errors)) throw err;
  }

  // 4. 兜底：Node.js 22.18+/24+ 原生类型擦除（不会把 ESM export 转成 CJS）
  if (typeof nodeModule.stripTypeScriptTypes === 'function') {
    const stripped = nodeModule.stripTypeScriptTypes(rawCode);
    if (/^\s*(export|import)\s+/m.test(stripped)) {
      throw new Error(
        'Node.js stripTypeScriptTypes fallback does not convert ESM import/export to CJS. Use module.exports = { main, testCases }, or install esbuild / esbuild-wasm.'
      );
    }
    return { code: stripped, compiler: 'node-strip-types' };
  }

  throw new Error(
    'No TypeScript compiler available. Install "esbuild" (or on Termux run "pkg install esbuild" / "npm install esbuild-wasm"), or upgrade to Node.js >=22.18.'
  );
}

module.exports = compileTs;
