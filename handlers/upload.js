// handlers/upload.js
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { isValidFolder, isValidSourceFilename, getBaseName } = require('../utils/validator');
const runInWorker = require('../utils/runInWorker');
const compileTs = require('../utils/compileTs');
const { withFunctionLock } = require('../utils/fnLock');

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
  const lockKey = `${folder}/${baseName}`;

  return withFunctionLock(lockKey, async () => {
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

      // 2. 先将所有待落盘文件写到同目录临时文件，保证后续切换一致
      await fs.writeFile(tmpJsPath, runnableJs, 'utf-8');
      if (isTs) {
        await fs.writeFile(tmpTsPath, rawCode, 'utf-8');
      }

      // 3. 在独立管理测试并发池中运行自带的 testCases
      const { passed, errors } = await runInWorker(tmpJsPath, 'test');
      if (!passed) {
        await fs.unlink(tmpJsPath).catch(() => {});
        await fs.unlink(tmpTsPath).catch(() => {});
        set.status = 400;
        return { error: 'Test cases failed', details: errors };
      }

      // 4. 全部准备就绪且测试通过后再原子 rename 生效
      if (isTs) {
        await fs.rename(tmpTsPath, finalTsPath);
      } else {
        await fs.unlink(finalTsPath).catch(() => {});
      }
      await fs.rename(tmpJsPath, finalJsPath);

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
  });
};
