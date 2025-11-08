#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/export_env.sh"

: "${API_BASE:?API_BASE must be set in .env.local (e.g., https://your-api.onrender.com)}"
: "${API_KEY:?API_KEY must be set in .env.local}"

echo "Health:"
curl -sf "$API_BASE/health" -H "x-api-key: $API_KEY" | sed -e 's/^/  /'

echo "Docs:"
curl -sf "$API_BASE/api-docs" -H "x-api-key: $API_KEY" | head -c 200 | sed -e 's/^/  /' || true

echo "Create job:"
RESP="$(curl -sf -X POST "$API_BASE/v1/jobs" \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"source_url":"https://example.com/video.mp4","preset_id":"everyday"}')"

echo "$RESP" | sed -e 's/^/  /'
JOB_ID="$(echo "$RESP" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -n1)"

if [[ -z "$JOB_ID" ]]; then
  echo "Could not parse job id. Response above."
  exit 1
fi

echo "Poll job: $JOB_ID"
curl -sf "$API_BASE/v1/jobs/$JOB_ID" -H "x-api-key: $API_KEY" | sed -e 's/^/  /'
