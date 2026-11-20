#!/usr/bin/env bash
set -euo pipefail

# 如果同目录存在 .env 文件，自动加载环境变量
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

exec node index.js
