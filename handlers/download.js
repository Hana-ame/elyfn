// handlers/download.js
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const { isValidFolder, isValidSourceFilename } = require('../utils/validator');

module.exports = async ({ params, set }) => {
  const { folder, filename } = params;

  if (!isValidFolder(folder) || !isValidSourceFilename(filename)) {
    set.status = 400;
    return { error: 'Invalid folder or filename (only .js and .ts can be downloaded)' };
  }

  const filePath = path.join(config.BASE_DIR, folder, filename);

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      set.status = 404;
      return { error: 'Not found' };
    }

    const content = await fs.readFile(filePath, 'utf-8');
    set.headers['Content-Type'] = filename.endsWith('.ts')
      ? 'application/typescript; charset=utf-8'
      : 'application/javascript; charset=utf-8';
    set.headers['Content-Disposition'] = `attachment; filename="${filename}"`;
    return content;
  } catch (err) {
    if (err.code === 'ENOENT') {
      set.status = 404;
      return { error: 'File not found' };
    }
    set.status = 500;
    return { error: 'Internal server error' };
  }
};
