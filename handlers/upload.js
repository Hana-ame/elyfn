// handlers/upload.js
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { isValidFolder, isValidSourceFilename, getBaseName } = require('../utils/validator');
const runInWorker = require('../utils/runInWorker');
const compileTs = require('../utils/compileTs');

module.exports = async ({ params, body, set }) => {
  const { folder, filename } = params;

  if (!isValidFolder(folder) || !isValidSourceFilename(filename)) {
    set.status = 400;
    return { error: 'Invalid folder or filename (only .js and .ts are allowed)' };
  }
  if (!body || !body.file) {
    set.status = 400;
    return { error: 'No file provided' };
  }

  const buffer = Buffer.from(await body.file.arrayBuffer());
  if (buffer.length > config.MAX_FILE_SIZE) {
    set.status = 413;
    return { error: `File too large (max ${config.MAX_FILE_SIZE} bytes)` };
  }

  const rawCode = buffer.toString('utf-8');
  const isTs = filename.endsWith('.ts');
  const baseName = getBaseName(filename);
  const folderDir = path.join(config.BASE_DIR, folder);
  const finalJsPath = path.join(folderDir, `${baseName}.js`);
  const finalTsPath = path.join(folderDir, `${baseName}.ts`);

  const tmpSuffix = crypto.randomBytes(6).toString('hex');
  const tmpJsPath = path.join(folderDir, `.tmp-${baseName}-${tmpSuffix}.js`);
  const tmpTsPath = path.join(folderDir, `.tmp-${baseName}-${tmpSuffix}.ts`);

  try {
    await fs.mkdir(folderDir, { recursive: true });

    // 1. 如果是 .ts 文件，通过 4 级降级编译链在上传期编译为可执行 JS
    let runnableJs = rawCode;
    let compiler = null;
    if (isTs) {
      const compiled = await compileTs(rawCode, filename);
      runnableJs = compiled.code;
      compiler = compiled.compiler;
    }

    // 2. 先写入同目录临时文件（不依赖 /tmp，兼容 Termux）
    await fs.writeFile(tmpJsPath, runnableJs, 'utf-8');

    // 3. 在独立 Worker 中运行自带的 testCases
    const { passed, errors } = await runInWorker(tmpJsPath, 'test');
    if (!passed) {
      await fs.unlink(tmpJsPath).catch(() => {});
      set.status = 400;
      return { error: 'Test cases failed', details: errors };
    }

    // 4. 测试通过后原子 rename 覆盖，实现零停机热更新
    await fs.rename(tmpJsPath, finalJsPath);

    if (isTs) {
      await fs.writeFile(tmpTsPath, rawCode, 'utf-8');
      await fs.rename(tmpTsPath, finalTsPath);
    } else {
      await fs.unlink(finalTsPath).catch(() => {});
    }

    set.status = 201;
    return {
      success: true,
      function: `${folder}/${baseName}`,
      compiledFromTs: isTs,
      compiler,
      endpoint: `/${folder}/${baseName}.js`,
    };
  } catch (err) {
    await fs.unlink(tmpJsPath).catch(() => {});
    await fs.unlink(tmpTsPath).catch(() => {});
    set.status = err.status || 400;
    return { error: err.message };
  }
};
