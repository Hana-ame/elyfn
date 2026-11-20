// handlers/execute.js
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const { isValidFolder, isValidFuncName, getBaseName } = require('../utils/validator');
const runInWorker = require('../utils/runInWorker');

module.exports = async ({ params, body, set }) => {
  const { folder, filename } = params;

  if (!isValidFolder(folder) || !isValidFuncName(filename)) {
    set.status = 400;
    return { error: 'Invalid folder or function name' };
  }

  const baseName = getBaseName(filename);
  const filePath = path.join(config.BASE_DIR, folder, `${baseName}.js`);

  try {
    await fs.access(filePath);
    const { result } = await runInWorker(filePath, 'execute', body);

    if (typeof result === 'object' && result !== null) {
      return result;
    }
    return { result };
  } catch (err) {
    if (err.code === 'ENOENT') {
      set.status = 404;
      return { error: 'Function not found' };
    }
    const status = err.status || 500;
    set.status = status;
    if (status >= 500 && status !== 504) {
      console.error(`Execute error (${folder}/${baseName}):`, err);
      return { error: 'Internal Server Error' };
    }
    return { error: err.message };
  }
};
