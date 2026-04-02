// handlers/execute.js
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const { isValidFolder, isValidFilename } = require('../utils/validator');
const runInWorker = require('../utils/runInWorker');

module.exports = async ({ params, body, set }) => {
  const { folder, filename } = params;

  if (!isValidFolder(folder) || !isValidFilename(filename)) {
    set.status = 400; return { error: 'Invalid Request' };
  }

  const filePath = path.join(config.BASE_DIR, folder, filename);

  try {
    const code = await fs.readFile(filePath, 'utf-8');
    
    // 在子线程中执行请求，避免主线程卡死
    const { result } = await runInWorker(code, 'execute', body);
    
    if (typeof result === 'object' && result !== null) {
      return result;
    } else {
      return { result };
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      set.status = 404; return { error: 'Function not found' };
    }
    set.status = 500; return { error: err.message };
  }
};