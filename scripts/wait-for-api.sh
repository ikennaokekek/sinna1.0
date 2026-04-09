#!/usr/bin/env bash
# Wait until the API responds on /health (401 without key or 200 with key are OK).
set -euo pipefail
BASE="${1:-http://127.0.0.1:4000}"
MAX="${2:-60}"
for i in $(seq 1 "$MAX"); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health" || echo "000")
  if [ "$code" = "200" ] || [ "$code" = "401" ]; then
    echo "API reachable at $BASE/health (HTTP $code)"
    exit 0
  fi
  if [ "$((i % 10))" -eq 0 ]; then
    echo "wait-for-api: attempt $i/$MAX, last code=$code"
  fi
  sleep 1
done
echo "wait-for-api: timed out waiting for $BASE/health"
exit 1
