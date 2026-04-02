// handlers/upload.js
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const { isValidFolder, isValidFilename } = require('../utils/validator');
const runInWorker = require('../utils/runInWorker');

module.exports = async ({ params, body, set }) => {
  const { folder, filename } = params;

  if (!isValidFolder(folder) || !isValidFilename(filename)) {
    set.status = 400; return { error: 'Invalid folder or filename format' };
  }
  if (!body.file) { set.status = 400; return { error: 'No file provided' }; }

  const savePath = path.join(config.BASE_DIR, folder, filename);

  try {
    await fs.mkdir(path.join(config.BASE_DIR, folder), { recursive: true });
    const buffer = Buffer.from(await body.file.arrayBuffer());
    const code = buffer.toString('utf-8');
    
    // 使用线程隔离来测试用户代码
    const { passed, errors } = await runInWorker(code, 'test');
    
    if (!passed) {
      set.status = 400; return { error: 'Test cases failed', details: errors };
    }

    await fs.writeFile(savePath, buffer);
    set.status = 201; return { success: true, path: savePath };
    
  } catch (err) {
    console.error('Upload error:', err);
    set.status = 400; return { error: err.message };
  }
};