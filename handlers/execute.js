// handlers/execute.js
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const { isValidFolder, isValidFuncName, getBaseName } = require('../utils/validator');
const runInWorker = require('../utils/runInWorker');
const { createJob, completeJob, failJob } = require('../utils/jobStore');

function isAsyncRequested(request, query) {
  if (query && (query.async === '1' || query.async === 'true')) return true;
  if (!request || !request.headers) return false;
  const asyncHeader = String(request.headers.get('x-elyfn-async') || '').toLowerCase();
  if (asyncHeader === '1' || asyncHeader === 'true') return true;
  const prefer = String(request.headers.get('prefer') || '').toLowerCase();
  return prefer.includes('respond-async');
}

module.exports = async ({ params, body, query, request, set }) => {
  const { folder, filename } = params;

  if (!isValidFolder(folder) || !isValidFuncName(filename)) {
    set.status = 400;
    return { error: 'Invalid folder or function name' };
  }

  const baseName = getBaseName(filename);
  const filePath = path.join(config.BASE_DIR, folder, `${baseName}.js`);

  try {
    await fs.access(filePath);

    if (isAsyncRequested(request, query)) {
      if (!runInWorker.hasWorkerSlot('execute')) {
        set.status = 429;
        return { error: `Too Many Requests: execute concurrency limit (${config.MAX_CONCURRENCY || 8}) reached` };
      }
      const job = createJob({ folder, name: baseName });
      runInWorker(filePath, 'execute', body, { timeoutMs: config.ASYNC_TIMEOUT_MS })
        .then(({ result }) => {
          const normalized = typeof result === 'object' && result !== null ? result : { result };
          completeJob(job.id, normalized);
        })
        .catch((err) => {
          failJob(job.id, err);
        });
      set.status = 202;
      return {
        ok: true,
        async: true,
        jobId: job.id,
        status: job.status,
        statusUrl: `/jobs/${job.id}`,
      };
    }

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
