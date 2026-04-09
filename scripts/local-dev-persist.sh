#!/usr/bin/env bash
# Long-running local API + Postgres + Redis: survives terminal close; DB/Redis survive reboot (Docker restart).
#
# Usage (from repo root):
#   pnpm dev:persist:start
#   pnpm dev:persist:stop          # stops API only; leaves DB/Redis running
#   pnpm dev:persist:stop --all    # stops API and Docker DB/Redis
#   pnpm dev:persist:status
#
# Env overrides: SINNA_LOCAL_PG_PORT (default 15432), SINNA_LOCAL_RD_PORT (default 16379), PORT (default 4000)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PG_PORT="${SINNA_LOCAL_PG_PORT:-15432}"
RD_PORT="${SINNA_LOCAL_RD_PORT:-16379}"
API_PORT="${PORT:-4000}"
PG_NAME="sinna-local-pg"
RD_NAME="sinna-local-redis"
PID_FILE="$ROOT/.sinna-local-api.pid"
LOG_FILE="$ROOT/.sinna-local-api.log"
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/postgres"
REDIS_URL="redis://127.0.0.1:${RD_PORT}"

ensure_docker() {
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is not running. Start Docker Desktop and retry."
    exit 1
  fi
}

ensure_postgres() {
  if docker ps -a --format '{{.Names}}' | grep -qx "$PG_NAME"; then
    docker start "$PG_NAME" >/dev/null
    docker update --restart unless-stopped "$PG_NAME" >/dev/null
  else
    docker run -d --name "$PG_NAME" --restart unless-stopped \
      -e POSTGRES_USER=postgres \
      -e POSTGRES_PASSWORD=postgres \
      -e POSTGRES_DB=postgres \
      -p "${PG_PORT}:5432" \
      postgres:15 >/dev/null
  fi
}

ensure_redis() {
  if docker ps -a --format '{{.Names}}' | grep -qx "$RD_NAME"; then
    docker start "$RD_NAME" >/dev/null
    docker update --restart unless-stopped "$RD_NAME" >/dev/null
  else
    docker run -d --name "$RD_NAME" --restart unless-stopped \
      -p "${RD_PORT}:6379" \
      redis:7 >/dev/null
  fi
}

wait_pg() {
  local i
  for i in $(seq 1 60); do
    if docker exec "$PG_NAME" pg_isready -U postgres >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Postgres did not become ready in time."
  exit 1
}

wait_redis() {
  local i
  for i in $(seq 1 30); do
    if docker exec "$RD_NAME" redis-cli ping 2>/dev/null | grep -q PONG; then
      return 0
    fi
    sleep 1
  done
  echo "Redis did not become ready in time."
  exit 1
}

api_running() {
  if [[ ! -f "$PID_FILE" ]]; then
    return 1
  fi
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

cmd_start() {
  ensure_docker
  echo "Starting $PG_NAME (localhost:${PG_PORT}) and $RD_NAME (localhost:${RD_PORT})..."
  ensure_postgres
  ensure_redis
  wait_pg
  wait_redis

  echo "Running migrations..."
  export DATABASE_URL
  pnpm -C apps/api run migrate

  if api_running; then
    echo "API already running (PID $(cat "$PID_FILE")). Log: $LOG_FILE"
    exit 0
  fi

  rm -f "$PID_FILE"
  echo "Starting API on port ${API_PORT} (detached; log: $LOG_FILE)..."
  (
    cd "$ROOT"
    export NODE_ENV=development
    export PORT="$API_PORT"
    export DATABASE_URL
    export REDIS_URL
    nohup pnpm -C apps/api dev >>"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
  )
  sleep 2
  if api_running; then
    echo "API PID $(cat "$PID_FILE"). Tail log: tail -f $LOG_FILE"
  else
    echo "API may have failed to start. Last log lines:"
    tail -n 40 "$LOG_FILE" 2>/dev/null || true
    exit 1
  fi
}

cmd_stop() {
  local stop_all=0
  if [[ "${1:-}" == "--all" ]]; then
    stop_all=1
  fi

  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping API (PID $pid)..."
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  else
    echo "No PID file; API not tracked as running."
  fi

  if [[ "$stop_all" -eq 1 ]]; then
    ensure_docker 2>/dev/null || true
    docker stop "$PG_NAME" "$RD_NAME" 2>/dev/null || true
    echo "Stopped $PG_NAME and $RD_NAME (containers kept; start again with dev:persist:start)."
  fi
}

cmd_status() {
  ensure_docker
  if docker inspect "$PG_NAME" >/dev/null 2>&1; then
    echo "Postgres ($PG_NAME): $(docker inspect -f '{{.State.Status}}' "$PG_NAME")"
  else
    echo "Postgres ($PG_NAME): not created"
  fi
  if docker inspect "$RD_NAME" >/dev/null 2>&1; then
    echo "Redis ($RD_NAME): $(docker inspect -f '{{.State.Status}}' "$RD_NAME")"
  else
    echo "Redis ($RD_NAME): not created"
  fi
  if api_running; then
    echo "API: running PID $(cat "$PID_FILE") (port ${API_PORT})"
  else
    echo "API: not running (or stale PID file removed)"
  fi
}

case "${1:-}" in
  start) cmd_start ;;
  stop) shift; cmd_stop "${@:-}" ;;
  status) cmd_status ;;
  *)
    echo "Usage: $0 {start|stop [--all]|status}"
    exit 1
    ;;
esac
