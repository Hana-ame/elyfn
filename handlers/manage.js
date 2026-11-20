// handlers/manage.js
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const { isValidFolder, isValidFuncName, getBaseName } = require('../utils/validator');
const { withFunctionLock } = require('../utils/fnLock');

async function listFunctions({ set }) {
  try {
    await fs.mkdir(config.BASE_DIR, { recursive: true });
    const entries = await fs.readdir(config.BASE_DIR, { withFileTypes: true });
    const functions = {};

    for (const dirent of entries) {
      if (!dirent.isDirectory()) continue;
      const folderPath = path.join(config.BASE_DIR, dirent.name);
      const files = await fs.readdir(folderPath);
      const visible = files.filter((f) => !f.startsWith('.tmp-') && f.endsWith('.js'));
      if (visible.length > 0) {
        functions[dirent.name] = visible;
      }
    }

    return { success: true, functions };
  } catch (err) {
    console.error('List functions error:', err);
    set.status = 500;
    return { error: 'Failed to list functions' };
  }
}

async function deleteFunction({ params, set }) {
  const { folder, filename } = params;
  if (!isValidFolder(folder) || !isValidFuncName(filename)) {
    set.status = 400;
    return { error: 'Invalid identifier' };
  }

  const baseName = getBaseName(filename);
  const lockKey = `${folder}/${baseName}`;

  return withFunctionLock(lockKey, async () => {
    const targetDir = path.join(config.BASE_DIR, folder);
    const jsPath = path.join(targetDir, `${baseName}.js`);
    const tsPath = path.join(targetDir, `${baseName}.ts`);

    try {
      await fs.unlink(jsPath);
      await fs.unlink(tsPath).catch(() => {});

      // 目录可能在并发上传时已非空，安全忽略 ENOTEMPTY / ENOENT
      try {
        await fs.rmdir(targetDir);
      } catch (rmdirErr) {
        if (rmdirErr.code !== 'ENOTEMPTY' && rmdirErr.code !== 'ENOENT') {
          console.warn(`Failed to remove empty folder ${folder}:`, rmdirErr.message);
        }
      }

      return { success: true, message: `Deleted ${folder}/${baseName}` };
    } catch (err) {
      if (err.code === 'ENOENT') {
        set.status = 404;
        return { error: 'Function not found' };
      }
      console.error(`Delete error (${folder}/${baseName}):`, err);
      set.status = 500;
      return { error: 'Delete failed' };
    }
  });
}

module.exports = { listFunctions, deleteFunction };
