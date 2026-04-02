// handlers/upload.js

const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

// 导入拆分出去的方法
const extractFromCode = require('../utils/extractFromCode');
const runTests = require('../utils/runTests');

module.exports = async ({ params, body, set }) => {
  const { folder, filename } = params;

  // 路径安全检查
  if (folder.includes('/') || folder.includes('..') || filename.includes('/') || filename.includes('..')) {
    set.status = 400; return { error: 'Invalid folder or filename' };
  }
  if (!filename.endsWith('.js')) {
    set.status = 400; return { error: 'Only JavaScript files (.js) are allowed' };
  }
  if (!body.file) {
    set.status = 400;
    return { error: 'No file provided' };
  }

  const file = body.file;
  if (file.size > config.MAX_FILE_SIZE) {
    set.status = 413;
    return { error: `File too large (max ${config.MAX_FILE_SIZE / 1024 / 1024}MB)` };
  }

  const saveDir = path.join(config.BASE_DIR, folder);
  const savePath = path.join(saveDir, filename);

  try {
    await fs.mkdir(saveDir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    const code = buffer.toString('utf-8');
    
    const { main, testCases } = await extractFromCode(code);
    
    // 在这里单独校验上传时的 testCases
    if (!Array.isArray(testCases)) {
      set.status = 400;
      return { error: 'No valid testCases array found in code' };
    }

    const { passed, errors } = await runTests(main, testCases);
    
    if (!passed) {
      set.status = 400;
      return { error: 'Test cases failed', details: errors };
    }

    // 3. 测试通过，保存文件
    await fs.writeFile(savePath, buffer);
    set.status = 201;
    return { success: true, path: savePath };
    
  } catch (err) {
    console.error(`Upload error for ${filename}:`, err);
    set.status = 400; 
    return { error: err.message };
  }
};