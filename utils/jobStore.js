// utils/jobStore.js
const crypto = require('crypto');
const config = require('../config');

const jobs = new Map();

/** Remove only finished jobs whose TTL has elapsed. Safe for read paths (GET /jobs). */
function pruneExpiredJobs() {
  const now = Date.now();
  const ttl = config.JOB_TTL_MS || 1800000;
  for (const [id, job] of jobs.entries()) {
    if (job.status !== 'running' && job.finishedAt && now - job.finishedAt > ttl) {
      jobs.delete(id);
    }
  }
}

/** Evict oldest finished jobs first (then oldest overall) until size < maxJobs before inserting. */
function evictForInsert() {
  pruneExpiredJobs();
  const maxJobs = Math.max(1, config.MAX_JOBS || 200);
  if (jobs.size >= maxJobs) {
    for (const [id, job] of jobs.entries()) {
      if (jobs.size < maxJobs) break;
      if (job.status !== 'running') {
        jobs.delete(id);
      }
    }
  }
  while (jobs.size >= maxJobs) {
    const oldestKey = jobs.keys().next().value;
    if (!oldestKey) break;
    jobs.delete(oldestKey);
  }
}

function createJob({ folder, name }) {
  evictForInsert();
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
  pruneExpiredJobs();
  return jobs.get(id) || null;
}

function listJobs() {
  pruneExpiredJobs();
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
