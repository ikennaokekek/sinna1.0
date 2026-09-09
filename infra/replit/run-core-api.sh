#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${DATABASE_SSL_MODE:?DATABASE_SSL_MODE is required}"
: "${REDIS_URL:?REDIS_URL is required}"
: "${REVISION:?REVISION is required}"
: "${PORT:?PORT is required}"
: "${DB_POOL_MAX:?DB_POOL_MAX is required}"
: "${DB_POOL_MIN:?DB_POOL_MIN is required}"
: "${QUEUE_PREFIX:?QUEUE_PREFIX is required}"
[[ "$REVISION" =~ ^[0-9a-f]{40}$ ]] || {
  echo "REVISION must be a lowercase full 40-character commit SHA" >&2
  exit 1
}
[[ "$DATABASE_SSL_MODE" =~ ^(disable|require|verify-full)$ ]] || {
  echo "DATABASE_SSL_MODE must be disable, require, or verify-full" >&2
  exit 1
}
[[ "$PORT" =~ ^[0-9]+$ ]] && ((PORT >= 1 && PORT <= 65535)) || {
  echo "PORT must be an integer between 1 and 65535" >&2
  exit 1
}
[[ "$DB_POOL_MAX" =~ ^[0-9]+$ ]] &&
  ((DB_POOL_MAX >= 1 && DB_POOL_MAX <= 20)) || {
  echo "DB_POOL_MAX must be an integer between 1 and 20" >&2
  exit 1
}
[[ "$DB_POOL_MIN" =~ ^[0-9]+$ ]] &&
  ((DB_POOL_MIN >= 0 && DB_POOL_MIN <= DB_POOL_MAX)) || {
  echo "DB_POOL_MIN must be an integer between 0 and DB_POOL_MAX" >&2
  exit 1
}
export NODE_ENV=production
exec node apps/api/dist/index.js
