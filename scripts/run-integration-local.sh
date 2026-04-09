#!/usr/bin/env bash
# Spin up Postgres + Redis in Docker, migrate, seed CI API key, run API + minimal workers,
# then run pnpm test:integration (and optionally Playwright E2E).
#
# Prerequisites: Docker daemon running, pnpm install already done.
# Usage (from repo root):
#   pnpm test:integration:local
#   RUN_E2E=0 pnpm test:integration:local   # skip Playwright
#   SINNA_IT_PG_PORT=15432 SINNA_IT_RD_PORT=16379 pnpm test:integration:local

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CI_TEST_API_KEY="${CI_TEST_API_KEY:-sinna-ci-test-api-key}"
PG_PORT="${SINNA_IT_PG_PORT:-15432}"
RD_PORT="${SINNA_IT_RD_PORT:-16379}"
API_PORT="${PORT:-4000}"
RUN_E2E="${RUN_E2E:-1}"

API_PID=""
WORKER_PID=""

cleanup() {
  set +e
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill -9 "$API_PID" 2>/dev/null || true
  fi
  if [[ -n "$WORKER_PID" ]] && kill -0 "$WORKER_PID" 2>/dev/null; then
    kill -9 "$WORKER_PID" 2>/dev/null || true
  fi
  docker rm -f sinna-it-pg sinna-it-redis >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop, then run:"
  echo "  pnpm test:integration:local"
  exit 1
fi

echo "Starting Postgres (localhost:${PG_PORT}) and Redis (localhost:${RD_PORT})..."
docker rm -f sinna-it-pg sinna-it-redis >/dev/null 2>&1 || true
docker run -d --name sinna-it-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=postgres \
  -p "${PG_PORT}:5432" \
  postgres:15 >/dev/null
docker run -d --name sinna-it-redis \
  -p "${RD_PORT}:6379" \
  redis:7 >/dev/null

echo "Waiting for Postgres..."
for _ in $(seq 1 60); do
  if docker exec sinna-it-pg pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec sinna-it-pg pg_isready -U postgres

echo "Waiting for Redis..."
for _ in $(seq 1 30); do
  if docker exec sinna-it-redis redis-cli ping 2>/dev/null | grep -q PONG; then
    break
  fi
  sleep 1
done

# pg_isready / redis-cli inside the container can succeed before the published host port accepts TCP.
wait_host_tcp() {
  local label="$1"
  local port="$2"
  local i
  for i in $(seq 1 45); do
    if HOST=127.0.0.1 PORT="$port" node -e '
const net = require("net");
const s = net.createConnection({ host: process.env.HOST, port: Number(process.env.PORT) });
s.on("connect", () => { s.end(); process.exit(0); });
s.on("error", () => process.exit(1));
s.setTimeout(3000, () => { try { s.destroy(); } catch (_) {} process.exit(1); });
' 2>/dev/null; then
      echo "$label accepting TCP on 127.0.0.1:${port}"
      return 0
    fi
    sleep 1
  done
  echo "Timeout: $label not accepting TCP on 127.0.0.1:${port}"
  return 1
}

wait_host_tcp "Postgres (host)" "$PG_PORT"
wait_host_tcp "Redis (host)" "$RD_PORT"

export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/postgres"
export REDIS_URL="redis://127.0.0.1:${RD_PORT}"
export PORT="$API_PORT"
export NODE_ENV=test
export JWT_SECRET=ci-jwt-secret-local-not-for-production
export STRIPE_SECRET_KEY=sk_test_ci_placeholder
export STRIPE_WEBHOOK_SECRET=whsec_ci_placeholder

echo "Building (if needed)..."
pnpm build

echo "Running migrations..."
pnpm -C apps/api run migrate

if command -v sha256sum >/dev/null 2>&1; then
  H=$(printf '%s' "$CI_TEST_API_KEY" | sha256sum | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
  H=$(printf '%s' "$CI_TEST_API_KEY" | shasum -a 256 | awk '{print $1}')
else
  H=$(printf '%s' "$CI_TEST_API_KEY" | openssl dgst -sha256 2>/dev/null | awk '{print $NF}')
fi
if [[ -z "$H" ]]; then
  echo "Could not compute SHA-256 of CI_TEST_API_KEY (need sha256sum, shasum, or openssl)."
  exit 1
fi

echo "Seeding CI tenant + API key..."
TENANT_ID=$(docker exec sinna-it-pg psql -U postgres -d postgres -Atq -c \
  "insert into tenants(name, active, plan, status) values ('ci', true, 'standard', 'active') returning id;" \
  | tr -d '[:space:]')
docker exec sinna-it-pg psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "insert into api_keys(key_hash, tenant_id) values ('$H', '$TENANT_ID');"

echo "Starting API on port ${API_PORT}..."
node apps/api/dist/index.js >"${ROOT}/.sinna-it-api.log" 2>&1 &
API_PID=$!
sleep 2
if ! kill -0 "$API_PID" 2>/dev/null; then
  echo "API failed to start. Log:"
  tail -n 80 "${ROOT}/.sinna-it-api.log" || true
  exit 1
fi

bash scripts/wait-for-api.sh "http://127.0.0.1:${API_PORT}" 90

# Unauthenticated /health is 401 without hitting DB; wait until auth + DB succeed.
echo "Waiting for authenticated /health (DB ready)..."
code="000"
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "x-api-key: ${CI_TEST_API_KEY}" \
    "http://127.0.0.1:${API_PORT}/health" || echo "000")
  if [[ "$code" == "200" ]]; then
    echo "Authenticated /health OK (HTTP 200)"
    break
  fi
  if [[ "$((i % 15))" -eq 0 ]]; then
    echo "Waiting for DB-backed health: attempt $i/90, last HTTP code=$code"
  fi
  sleep 1
done
if [[ "$code" != "200" ]]; then
  echo "Authenticated /health did not return 200. Recent API log:"
  tail -n 80 "${ROOT}/.sinna-it-api.log" || true
  exit 1
fi

echo "Starting minimal BullMQ workers..."
REDIS_URL="$REDIS_URL" node -e "
  const { Worker } = require('bullmq');
  const IORedis = require('ioredis');
  const c = new IORedis(process.env.REDIS_URL);
  const mk = (q) => new Worker(q, async () => ({ ok: true }), { connection: c });
  mk('captions'); mk('ad'); mk('color'); mk('video-transform');
  setInterval(() => {}, 1 << 30);
" >"${ROOT}/.sinna-it-worker.log" 2>&1 &
WORKER_PID=$!

export E2E_BASE_URL="http://127.0.0.1:${API_PORT}"
export API_BASE_URL="$E2E_BASE_URL"
export TEST_API_KEY="$CI_TEST_API_KEY"
export API_KEY="$CI_TEST_API_KEY"

echo "Running Vitest integration smoke..."
pnpm test:integration

if [[ "$RUN_E2E" == "1" ]]; then
  echo "Installing Playwright Chromium (if missing)..."
  pnpm exec playwright install chromium
  echo "Running Playwright E2E..."
  pnpm test:e2e
fi

echo "Done. Integration (and E2E if enabled) passed."
