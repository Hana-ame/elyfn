// handlers/download.js

const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

module.exports = async ({ params, set }) => {
  const { folder, filename } = params;

  if (folder.includes('/') || folder.includes('..') || filename.includes('/') || filename.includes('..')) {
    set.status = 400;
    return { error: 'Invalid folder or filename' };
  }
  if (!filename.endsWith('.js')) {
    set.status = 400;
    return { error: 'Only JavaScript files can be downloaded' };
  }

  const filePath = path.join(config.BASE_DIR, folder, filename);

  try {
    await fs.access(filePath);
    const stat = await fs.stat(filePath);
    
    if (!stat.isFile()) {
      set.status = 404;
      return { error: 'Not found' };
    }
    
    // 以 UTF-8 文本读取代码文件
    const content = await fs.readFile(filePath, 'utf-8');
    
    // 使用 Elysia 的 set 注入 headers，直接 return 字符串体
    set.headers['Content-Type'] = 'application/javascript';
    set.headers['Content-Disposition'] = `attachment; filename="${filename}"`;
    
    return content;
    
  } catch (err) {
    if (err.code === 'ENOENT') {
      set.status = 404;
      return { error: 'File not found' };
    }
    console.error('Download error:', err);
    set.status = 500;
    return { error: 'Internal server error' };
  }
};