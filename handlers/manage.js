// handlers/manage.js
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const { isValidFolder, isValidFilename } = require('../utils/validator');

async function listFunctions({ set }) {
  try {
    await fs.mkdir(config.BASE_DIR, { recursive: true });
    const folders = await fs.readdir(config.BASE_DIR, { withFileTypes: true });
    const functions = {};
    
    for (const dirent of folders) {
      if (dirent.isDirectory()) {
        const folderPath = path.join(config.BASE_DIR, dirent.name);
        const files = await fs.readdir(folderPath);
        functions[dirent.name] = files.filter(f => f.endsWith('.js'));
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
  if (!isValidFolder(folder) || !isValidFilename(filename)) {
    set.status = 400; return { error: 'Invalid identifier' };
  }

  try {
    const targetDir = path.join(config.BASE_DIR, folder);
    const targetPath = path.join(targetDir, filename);
    
    await fs.unlink(targetPath); // 删除文件
    
    // 如果文件夹空了，顺便删除文件夹
    const remainingFiles = await fs.readdir(targetDir);
    if (remainingFiles.length === 0) {
      await fs.rmdir(targetDir);
    }
    return { success: true, message: `Deleted ${folder}/${filename}` };
  } catch (err) {
    if (err.code === 'ENOENT') {
      set.status = 404; return { error: 'Function not found' };
    }
    set.status = 500; return { error: 'Delete failed' };
  }
}

module.exports = { listFunctions, deleteFunction };