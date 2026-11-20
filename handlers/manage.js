// handlers/manage.js
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const { isValidFolder, isValidFuncName, getBaseName } = require('../utils/validator');

async function listFunctions({ set }) {
  try {
    await fs.mkdir(config.BASE_DIR, { recursive: true });
    const entries = await fs.readdir(config.BASE_DIR, { withFileTypes: true });
    const functions = {};

    for (const dirent of entries) {
      if (!dirent.isDirectory()) continue;
      const folderPath = path.join(config.BASE_DIR, dirent.name);
      const files = await fs.readdir(folderPath);
      // 忽略原子写入期间的 .tmp-* 临时文件
      const visible = files.filter((f) => !f.startsWith('.tmp-') && f.endsWith('.js'));
      if (visible.length > 0) {
        functions[dirent.name] = visible;
      }
    }

    return { success: true, functions };
  } catch (err) {
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
  const targetDir = path.join(config.BASE_DIR, folder);
  const jsPath = path.join(targetDir, `${baseName}.js`);
  const tsPath = path.join(targetDir, `${baseName}.ts`);

  try {
    await fs.unlink(jsPath);
    await fs.unlink(tsPath).catch(() => {});

    const remainingFiles = await fs.readdir(targetDir);
    if (remainingFiles.length === 0) {
      await fs.rmdir(targetDir);
    }
    return { success: true, message: `Deleted ${folder}/${baseName}` };
  } catch (err) {
    if (err.code === 'ENOENT') {
      set.status = 404;
      return { error: 'Function not found' };
    }
    set.status = 500;
    return { error: 'Delete failed' };
  }
}

module.exports = { listFunctions, deleteFunction };
