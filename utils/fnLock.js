// utils/fnLock.js
// 按 folder/baseName 串行化上传与删除操作，避免并发竞态

const locks = new Map();

function withFunctionLock(key, task) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => task());
  const cleanup = () => {
    if (locks.get(key) === next) {
      locks.delete(key);
    }
  };
  next.then(cleanup, cleanup);
  return next;
}

module.exports = { withFunctionLock };
