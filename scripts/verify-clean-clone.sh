#!/usr/bin/env bash
# Provider-neutral clean-clone verification.  It only starts disposable local
# PostgreSQL and Redis processes and deliberately clears cloud credentials.
#
# Prerequisites: Node 20-24, pnpm 10, PostgreSQL client/server tools (initdb,
# pg_ctl, psql), and redis-server. No Docker daemon is required.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "verify:clean-clone requires '$1' on PATH." >&2
    exit 1
  }
}

require pnpm
require node
require initdb
require pg_ctl
require psql
require postgres
require redis-server
require curl

PG_MAJOR="$(postgres --version | awk '{print $3}' | cut -d. -f1)"
if [[ ! "$PG_MAJOR" =~ ^[0-9]+$ ]] || (( PG_MAJOR < 17 )); then
  echo "verify:clean-clone requires PostgreSQL 17 or newer server tools." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/sinna-clean-clone.XXXXXX")"
PG_DATA="$TMP_DIR/postgres"
PG_SOCKET="$TMP_DIR/postgres-socket"
API_LOG="$TMP_DIR/api.log"
WORKER_LOG="$TMP_DIR/worker.log"
API_PID=""
WORKER_PID=""
REDIS_PID=""
PG_STARTED=0

free_port() {
  node -e '
    const net = require("net");
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      process.stdout.write(String(server.address().port));
      server.close();
    });
  '
}

PG_PORT="$(free_port)"
REDIS_PORT="$(free_port)"
API_PORT="$(free_port)"

cleanup() {
  set +e
  for pid in "$API_PID" "$WORKER_PID" "$REDIS_PID"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null || true; fi
  done
  if [[ "$PG_STARTED" == 1 ]]; then pg_ctl -D "$PG_DATA" -m immediate stop >/dev/null 2>&1 || true; fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

wait_tcp() {
  local name="$1" port="$2"
  for _ in $(seq 1 60); do
    if PORT="$port" node -e '
      const net = require("net");
      const s = net.connect(Number(process.env.PORT), "127.0.0.1");
      s.on("connect", () => { s.destroy(); process.exit(0); });
      s.on("error", () => process.exit(1));
      s.setTimeout(1000, () => process.exit(1));
    ' >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "Timed out waiting for $name on port $port" >&2
  return 1
}

# Do not allow a developer's shell or .env to direct this check to a provider.
export DATABASE_URL="postgresql://postgres@127.0.0.1:${PG_PORT}/postgres"
export REDIS_URL="redis://127.0.0.1:${REDIS_PORT}"
export PORT="$API_PORT"
export NODE_ENV=test
export JWT_SECRET=clean-clone-test-secret
export STRIPE_SECRET_KEY=
export STRIPE_WEBHOOK_SECRET=
export R2_ACCOUNT_ID=
export R2_ACCESS_KEY_ID=
export R2_SECRET_ACCESS_KEY=
export R2_BUCKET=
export CLOUDINARY_URL=
export ASSEMBLYAI_API_KEY=
export OPENAI_API_KEY=
export SENTRY_DSN=
export RESEND_API_KEY=
export SENDGRID_API_KEY=
export NOTIFY_FROM_EMAIL=

echo "Verifying frozen install, build, and offline unit tests..."
pnpm verify:offline

echo "Starting disposable PostgreSQL and Redis..."
mkdir -p "$PG_SOCKET"
initdb -D "$PG_DATA" -U postgres -A trust >/dev/null
if ! pg_ctl -D "$PG_DATA" -l "$TMP_DIR/postgres.log" \
  -o "-h 127.0.0.1 -p ${PG_PORT} -k ${PG_SOCKET}" -w start >/dev/null; then
  cat "$TMP_DIR/postgres.log" >&2
  exit 1
fi
PG_STARTED=1
redis-server --bind 127.0.0.1 --port "$REDIS_PORT" --save '' --appendonly no >"$TMP_DIR/redis.log" 2>&1 &
REDIS_PID=$!
wait_tcp PostgreSQL "$PG_PORT"
wait_tcp Redis "$REDIS_PORT"

echo "Bootstrapping and recording the empty database..."
pnpm migrate:bootstrap
pnpm migrate:apply
pnpm migrate:verify

echo "Starting API and checking /health..."
node apps/api/dist/index.js >"$API_LOG" 2>&1 &
API_PID=$!
if ! bash scripts/wait-for-api.sh "http://127.0.0.1:${API_PORT}" 60; then
  cat "$API_LOG" >&2
  exit 1
fi
if ! curl -fsS "http://127.0.0.1:${API_PORT}/health" >/dev/null; then
  cat "$API_LOG" >&2
  exit 1
fi

echo "Starting worker..."
node apps/worker/dist/index.js >"$WORKER_LOG" 2>&1 &
WORKER_PID=$!
sleep 2
if ! kill -0 "$WORKER_PID" 2>/dev/null; then
  cat "$WORKER_LOG" >&2
  exit 1
fi
echo "Clean-clone verification passed (all services were local and disposable)."