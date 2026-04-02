// handlers/execute.js

const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const extractFromCode = require('../utils/extractFromCode');

module.exports = async ({ params, body, set }) => {
  const { folder, filename } = params;

  if (folder.includes('/') || folder.includes('..') || filename.includes('/') || filename.includes('..')) {
    set.status = 400;
    return { error: 'Invalid folder or filename' };
  }
  if (!filename.endsWith('.js')) {
    set.status = 400;
    return { error: 'Only JavaScript files can be executed' };
  }

  const filePath = path.join(config.BASE_DIR, folder, filename);

  try {
    await fs.access(filePath);
    const code = await fs.readFile(filePath, 'utf-8');
    
    // 使用提取器获取函数
    const { main } = await extractFromCode(code);
    
    // 执行函数
    const result = await main(body);
    
    // 格式化输出
    if (typeof result === 'object' && result !== null) {
      return result;
    } else {
      return { result };
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      set.status = 404;
      return { error: 'File not found' };
    }
    console.error('Execution error:', err);
    set.status = 500;
    return { error: err.message };
  }
};