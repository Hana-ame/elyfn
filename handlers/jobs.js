// handlers/jobs.js
const { getJob, listJobs } = require('../utils/jobStore');

async function getJobStatus({ params, set }) {
  const job = getJob(params.id);
  if (!job) {
    set.status = 404;
    return { ok: false, error: 'Job not found' };
  }
  return {
    ok: true,
    ...job,
    elapsedMs: job.finishedAt ? job.durationMs : Date.now() - job.startedAt,
  };
}

async function listJobStatuses() {
  const items = listJobs();
  return {
    ok: true,
    count: items.length,
    jobs: items,
  };
}

module.exports = {
  getJobStatus,
  listJobStatuses,
};
