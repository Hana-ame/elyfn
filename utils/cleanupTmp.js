// utils/cleanupTmp.js
const fs = require('fs').promises;
const path = require('path');

/**
 * 清理 functions 目录下可能因异常崩溃残留的 .tmp-* 临时文件
 */
async function cleanupTmpFiles(baseDir) {
  try {
    await fs.mkdir(baseDir, { recursive: true });
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    for (const dirent of entries) {
      if (!dirent.isDirectory()) continue;
      const folderPath = path.join(baseDir, dirent.name);
      const files = await fs.readdir(folderPath);
      for (const f of files) {
        if (f.startsWith('.tmp-')) {
          await fs.unlink(path.join(folderPath, f)).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.warn('[WARNING] Failed to clean up temporary files:', err.message);
  }
}

module.exports = { cleanupTmpFiles };
