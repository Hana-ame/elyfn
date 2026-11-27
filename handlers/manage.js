// handlers/manage.js
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const { isValidFolder, isValidFuncName, getBaseName } = require('../utils/validator');
const { withFunctionLock } = require('../utils/fnLock');

async function scanDeployedFunctions() {
  await fs.mkdir(config.BASE_DIR, { recursive: true });
  const entries = await fs.readdir(config.BASE_DIR, { withFileTypes: true });
  const functions = {};

  for (const dirent of entries) {
    if (!dirent.isDirectory()) continue;
    const folderPath = path.join(config.BASE_DIR, dirent.name);
    const files = await fs.readdir(folderPath);
    const visible = files
      .filter((f) => !f.startsWith('.tmp-') && f.endsWith('.js'))
      .sort();
    if (visible.length > 0) {
      functions[dirent.name] = visible;
    }
  }

  return functions;
}

async function listFunctions({ set }) {
  try {
    const functions = await scanDeployedFunctions();
    return { success: true, functions };
  } catch (err) {
    console.error('List functions error:', err);
    set.status = 500;
    return { error: 'Failed to list functions' };
  }
}

/**
 * 只读可调用函数目录（不含源码，仅返回 folder/fn 名称与调用路径），
 * 供普通调用方与前端画布自动拉取函数目录使用。
 */
async function getCatalog({ set }) {
  try {
    const raw = await scanDeployedFunctions();
    const functions = {};
    const endpoints = [];

    for (const folder of Object.keys(raw).sort()) {
      const names = raw[folder].map((f) => getBaseName(f));
      functions[folder] = names;
      for (const name of names) {
        endpoints.push({
          folder,
          name,
          id: `${folder}/${name}`,
          endpoint: `/${folder}/${name}`,
        });
      }
    }

    return {
      success: true,
      count: endpoints.length,
      functions,
      endpoints,
    };
  } catch (err) {
    console.error('Get catalog error:', err);
    set.status = 500;
    return { error: 'Failed to load function catalog' };
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

module.exports = { listFunctions, getCatalog, deleteFunction };
