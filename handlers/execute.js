const fs = require('fs').promises;
const path = require('path');
const vm = require('vm');
const config = require('../config');

async function loadMainFunction(filePath) {
  const code = await fs.readFile(filePath, 'utf-8');
  const sandbox = { main: null };
  const script = new vm.Script(code, { filename: path.basename(filePath) });
  script.runInNewContext(sandbox, { timeout: config.EXECUTION_TIMEOUT_MS });
  if (typeof sandbox.main !== 'function') {
    throw new Error('No valid main function found');
  }
  return sandbox.main;
}

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
    const mainFunc = await loadMainFunction(filePath);
    const result = await mainFunc(body);
    // 如果返回对象则直接返回（自动 JSON 化），否则包装
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