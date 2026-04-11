#!/bin/bash
set -euo pipefail

K="sinna-e2e-test-1775781134"
B="http://127.0.0.1:4000"
P=0; F=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  PASS [$label] $expected"
    P=$((P+1))
  else
    echo "  FAIL [$label] expected=$expected got=$actual"
    F=$((F+1))
  fi
}

echo "======================================="
echo "  SINNA E2E CLIENT INTEGRATION TEST"
echo "======================================="
echo ""

echo "--- 1. HEALTH ENDPOINT ---"
check "health-noauth" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$B/health")"
check "health-auth" "200" "$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: $K" "$B/health")"

echo ""
echo "--- 2. AUTHENTICATION ---"
check "sub-auth" "200" "$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: $K" "$B/v1/me/subscription")"
check "sub-noauth" "401" "$(curl -s -o /dev/null -w '%{http_code}' "$B/v1/me/subscription")"
check "usage-auth" "200" "$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: $K" "$B/v1/me/usage")"
check "usage-noauth" "401" "$(curl -s -o /dev/null -w '%{http_code}' "$B/v1/me/usage")"
check "bad-key" "401" "$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: totally-fake" "$B/v1/me/subscription")"

echo ""
echo "--- 3. INPUT VALIDATION ---"
check "no-source" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "x-api-key: $K" -d '{"preset_id":"everyday"}' "$B/v1/jobs")"
check "bad-url" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "x-api-key: $K" -d '{"source_url":"not-a-url","preset_id":"everyday"}' "$B/v1/jobs")"
check "bad-preset" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "x-api-key: $K" -d '{"source_url":"https://example.com/v.mp4","preset_id":"bogus"}' "$B/v1/jobs")"
check "empty-body" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "x-api-key: $K" -d '{}' "$B/v1/jobs")"
check "job-noauth" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"source_url":"https://example.com/v.mp4","preset_id":"everyday"}' "$B/v1/jobs")"

echo ""
echo "--- 4. SECURITY ---"
check "sqli" "401" "$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: ' OR 1=1 --" "$B/v1/me/subscription")"
check "xss" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "x-api-key: $K" -d '{"source_url":"<script>alert(1)</script>","preset_id":"everyday"}' "$B/v1/jobs")"
check "long-key" "401" "$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: $(python3 -c 'print("A"*999)')" "$B/v1/me/subscription")"

echo ""
echo "--- 5. ERROR HANDLING ---"
check "bad-job-id" "404" "$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: $K" "$B/v1/jobs/99999999")"
check "unknown-route" "404" "$(curl -s -o /dev/null -w '%{http_code}' "$B/v1/doesnotexist")"

echo ""
echo "--- 6. RESPONSE BODY VALIDATION ---"
HEALTH_BODY=$(curl -s "$B/health")
echo "  Health body: $HEALTH_BODY"
if echo "$HEALTH_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']==True" 2>/dev/null; then
  echo "  PASS [health-json] ok=true"
  P=$((P+1))
else
  echo "  FAIL [health-json] missing ok=true"
  F=$((F+1))
fi

SUB_BODY=$(curl -s -H "x-api-key: $K" "$B/v1/me/subscription")
echo "  Subscription body: $SUB_BODY"
if echo "$SUB_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('success')==True or d.get('plan') or d.get('data')" 2>/dev/null; then
  echo "  PASS [sub-body] valid JSON"
  P=$((P+1))
else
  echo "  FAIL [sub-body] unexpected structure"
  F=$((F+1))
fi

USAGE_BODY=$(curl -s -H "x-api-key: $K" "$B/v1/me/usage")
echo "  Usage body: $USAGE_BODY"
if echo "$USAGE_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('success')==True" 2>/dev/null; then
  echo "  PASS [usage-body] success=true"
  P=$((P+1))
else
  echo "  FAIL [usage-body] missing success=true"
  F=$((F+1))
fi

echo ""
echo "--- 7. CREATE JOB (everyday preset) ---"
JOB_RESP=$(curl -s -X POST -H 'Content-Type: application/json' -H "x-api-key: $K" \
  -d '{"source_url":"https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4","preset_id":"everyday"}' \
  "$B/v1/jobs")
echo "  Create response: $JOB_RESP"
JOB_ID=$(echo "$JOB_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
if [[ -n "$JOB_ID" ]]; then
  echo "  PASS [job-create] id=$JOB_ID"
  P=$((P+1))
else
  echo "  FAIL [job-create] no job ID returned"
  F=$((F+1))
fi

echo ""
echo "--- 8. POLL JOB TO COMPLETION ---"
if [[ -n "$JOB_ID" ]]; then
  for i in $(seq 1 30); do
    sleep 3
    STATUS_RESP=$(curl -s -H "x-api-key: $K" "$B/v1/jobs/$JOB_ID")
    STATUS=$(echo "$STATUS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
    echo "  Poll $i: status=$STATUS"
    if [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]]; then
      break
    fi
  done

  echo ""
  echo "  Final job response:"
  echo "$STATUS_RESP" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RESP"

  if [[ "$STATUS" == "completed" ]]; then
    echo "  PASS [job-complete] completed"
    P=$((P+1))
  else
    echo "  FAIL [job-complete] status=$STATUS"
    F=$((F+1))
  fi
fi

echo ""
echo "======================================="
echo "  RESULTS: $P passed, $F failed"
echo "======================================="
