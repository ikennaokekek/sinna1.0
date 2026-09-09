#!/usr/bin/env bash
set -euo pipefail

export NODE_ENV=development
export PORT="${PORT:-5000}"
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
export QUEUE_PREFIX="${QUEUE_PREFIX:-sinna:mvp}"
export WORKER_INSTANCE_ID="${WORKER_INSTANCE_ID:-replit-mvp-worker}"
export WORKER_CONCURRENCY="${WORKER_CONCURRENCY:-2}"
export WORKER_SHUTDOWN_TIMEOUT_MS="${WORKER_SHUTDOWN_TIMEOUT_MS:-30000}"

redis_pid=''
worker_pid=''
api_pid=''

cleanup() {
  trap - EXIT INT TERM
  if [[ -n "$worker_pid" ]]; then
    kill -TERM "$worker_pid" 2>/dev/null || true
    wait "$worker_pid" 2>/dev/null || true
  fi
  if [[ -n "$api_pid" ]]; then
    kill -TERM "$api_pid" 2>/dev/null || true
    wait "$api_pid" 2>/dev/null || true
  fi
  if [[ -n "$redis_pid" ]]; then
    kill -TERM "$redis_pid" 2>/dev/null || true
    wait "$redis_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [[ "$REDIS_URL" == 'redis://127.0.0.1:6379' ]]; then
  redis-server \
    --bind 127.0.0.1 \
    --protected-mode yes \
    --port 6379 \
    --save '' \
    --appendonly no &
  redis_pid=$!
  for _ in $(seq 1 50); do
    if redis-cli -u "$REDIS_URL" ping 2>/dev/null | grep -qx PONG; then
      break
    fi
    kill -0 "$redis_pid" 2>/dev/null || {
      echo 'Local Redis exited during startup' >&2
      exit 1
    }
    sleep 0.1
  done
  redis-cli -u "$REDIS_URL" ping 2>/dev/null | grep -qx PONG || {
    echo 'Local Redis did not become ready' >&2
    exit 1
  }
fi

node apps/worker/dist/index.js &
worker_pid=$!
node apps/api/dist/index.js &
api_pid=$!

wait -n "$worker_pid" "$api_pid"
