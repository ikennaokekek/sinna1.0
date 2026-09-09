#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${DATABASE_SSL_MODE:?DATABASE_SSL_MODE is required}"
: "${REDIS_URL:?REDIS_URL is required}"
: "${REVISION:?REVISION is required}"
: "${QUEUE_PREFIX:?QUEUE_PREFIX is required}"
: "${WORKER_INSTANCE_ID:?WORKER_INSTANCE_ID is required}"
: "${WORKER_CONCURRENCY:?WORKER_CONCURRENCY is required}"
: "${WORKER_SHUTDOWN_TIMEOUT_MS:?WORKER_SHUTDOWN_TIMEOUT_MS is required}"
[[ "$REVISION" =~ ^[0-9a-f]{40}$ ]] || {
  echo "REVISION must be a lowercase full 40-character commit SHA" >&2
  exit 1
}
[[ "$DATABASE_SSL_MODE" =~ ^(disable|require|verify-full)$ ]] || {
  echo "DATABASE_SSL_MODE must be disable, require, or verify-full" >&2
  exit 1
}
[[ "$QUEUE_PREFIX" =~ ^[a-z0-9][a-z0-9:_-]{2,63}$ ]] || {
  echo "QUEUE_PREFIX must be 3-64 lowercase letters, numbers, colons, underscores, or hyphens" >&2
  exit 1
}
[[ "$WORKER_INSTANCE_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{2,127}$ ]] || {
  echo "WORKER_INSTANCE_ID must be a stable 3-128 character identifier" >&2
  exit 1
}
[[ "$WORKER_CONCURRENCY" =~ ^[0-9]+$ ]] && ((WORKER_CONCURRENCY >= 1 && WORKER_CONCURRENCY <= 16)) || {
  echo "WORKER_CONCURRENCY must be an integer between 1 and 16" >&2
  exit 1
}
[[ "$WORKER_SHUTDOWN_TIMEOUT_MS" =~ ^[0-9]+$ ]] &&
  ((WORKER_SHUTDOWN_TIMEOUT_MS >= 10000 && WORKER_SHUTDOWN_TIMEOUT_MS <= 300000)) || {
  echo "WORKER_SHUTDOWN_TIMEOUT_MS must be an integer between 10000 and 300000" >&2
  exit 1
}
export NODE_ENV=production
exec node apps/worker/dist/index.js
