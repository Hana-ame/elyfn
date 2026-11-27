// utils/jobStore.js
const crypto = require('crypto');
const config = require('../config');

const jobs = new Map();

/** Evict expired finished jobs or oldest entries when exceeding MAX_JOBS. */
function pruneJobs() {
  const now = Date.now();
  const ttl = config.JOB_TTL_MS || 1800000;
  for (const [id, job] of jobs.entries()) {
    if (job.status !== 'running' && job.finishedAt && now - job.finishedAt > ttl) {
      jobs.delete(id);
    }
  }
  const maxJobs = config.MAX_JOBS || 200;
  while (jobs.size >= maxJobs) {
    const oldestKey = jobs.keys().next().value;
    if (!oldestKey) break;
    jobs.delete(oldestKey);
  }
}

function createJob({ folder, name }) {
  pruneJobs();
  const now = Date.now();
  const id = crypto.randomUUID();
  const job = {
    id,
    folder,
    name,
    status: 'running',
    createdAt: now,
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
    durationMs: null,
    result: null,
    error: null,
  };
  jobs.set(id, job);
  return job;
}

function completeJob(id, result) {
  const job = jobs.get(id);
  if (!job) return null;
  const now = Date.now();
  job.status = 'completed';
  job.updatedAt = now;
  job.finishedAt = now;
  job.durationMs = now - job.startedAt;
  job.result = result;
  job.error = null;
  return job;
}

function failJob(id, err) {
  const job = jobs.get(id);
  if (!job) return null;
  const now = Date.now();
  job.status = 'failed';
  job.updatedAt = now;
  job.finishedAt = now;
  job.durationMs = now - job.startedAt;
  job.error = err && err.message ? err.message : String(err || 'Unknown error');
  return job;
}

function getJob(id) {
  pruneJobs();
  return jobs.get(id) || null;
}

function listJobs() {
  pruneJobs();
  return Array.from(jobs.values())
    .reverse()
    .map(({ id, folder, name, status, createdAt, startedAt, finishedAt, durationMs, error }) => ({
      id,
      folder,
      name,
      status,
      createdAt,
      startedAt,
      finishedAt,
      durationMs,
      error,
    }));
}

module.exports = {
  createJob,
  completeJob,
  failJob,
  getJob,
  listJobs,
};
