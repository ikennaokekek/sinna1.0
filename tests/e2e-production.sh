#!/bin/bash
set -uo pipefail

K="sinna-prod-e2e-test-1775909126"
B="https://sinna1-0.onrender.com"
P=0; F=0
VIDEO="https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"

check() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    printf "  \033[32mPASS\033[0m [%s] %s\n" "$label" "$expected"
    P=$((P+1))
  else
    printf "  \033[31mFAIL\033[0m [%s] expected=%s got=%s\n" "$label" "$expected" "$actual"
    F=$((F+1))
  fi
}

echo "============================================"
echo "  SINNA PRODUCTION E2E CLIENT INTEGRATION"
echo "  Target: $B"
echo "============================================"
echo ""

# ──────────────────────────────────────────────
echo "--- 1. HEALTH ENDPOINT ---"
check "health-noauth" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$B/health")"
check "health-auth"   "200" "$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: $K" "$B/health")"

HEALTH_BODY=$(curl -s "$B/health")
if echo "$HEALTH_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']==True" 2>/dev/null; then
  check "health-json" "ok" "ok"
else
  check "health-json" "ok" "bad-json"
fi

# ──────────────────────────────────────────────
echo ""
echo "--- 2. AUTHENTICATION ---"
check "sub-auth"      "200" "$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: $K" "$B/v1/me/subscription")"
check "sub-noauth"    "401" "$(curl -s -o /dev/null -w '%{http_code}' "$B/v1/me/subscription")"
check "usage-auth"    "200" "$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: $K" "$B/v1/me/usage")"
check "usage-noauth"  "401" "$(curl -s -o /dev/null -w '%{http_code}' "$B/v1/me/usage")"
check "bad-key"       "401" "$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: totally-fake" "$B/v1/me/subscription")"
check "empty-key"     "401" "$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: " "$B/v1/me/subscription")"

# ──────────────────────────────────────────────
echo ""
echo "--- 3. INPUT VALIDATION ---"
check "no-source"  "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "x-api-key: $K" -d '{"preset_id":"everyday"}' "$B/v1/jobs")"
check "bad-url"    "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "x-api-key: $K" -d '{"source_url":"not-a-url","preset_id":"everyday"}' "$B/v1/jobs")"
check "bad-preset" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "x-api-key: $K" -d '{"source_url":"'"$VIDEO"'","preset_id":"bogus"}' "$B/v1/jobs")"
check "empty-body" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "x-api-key: $K" -d '{}' "$B/v1/jobs")"
check "job-noauth" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"source_url":"'"$VIDEO"'","preset_id":"everyday"}' "$B/v1/jobs")"

# ──────────────────────────────────────────────
echo ""
echo "--- 4. SECURITY ---"
check "sqli"     "403" "$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: ' OR 1=1 --" "$B/v1/me/subscription")"
check "xss"      "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "x-api-key: $K" -d '{"source_url":"<script>alert(1)</script>","preset_id":"everyday"}' "$B/v1/jobs")"
check "long-key" "401" "$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: $(python3 -c 'print("A"*999)')" "$B/v1/me/subscription")"

# ──────────────────────────────────────────────
echo ""
echo "--- 5. ERROR HANDLING ---"
check "bad-job-id"    "404" "$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: $K" "$B/v1/jobs/99999999")"
check "unknown-route" "401" "$(curl -s -o /dev/null -w '%{http_code}' "$B/v1/doesnotexist")"

# ──────────────────────────────────────────────
echo ""
echo "--- 6. RESPONSE BODY VALIDATION ---"

SUB_BODY=$(curl -s -H "x-api-key: $K" "$B/v1/me/subscription")
echo "  Subscription: $SUB_BODY"
if echo "$SUB_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('success')==True" 2>/dev/null; then
  check "sub-body" "valid" "valid"
else
  check "sub-body" "valid" "invalid"
fi

USAGE_BODY=$(curl -s -H "x-api-key: $K" "$B/v1/me/usage")
echo "  Usage: $USAGE_BODY"
if echo "$USAGE_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('success')==True" 2>/dev/null; then
  check "usage-body" "valid" "valid"
else
  check "usage-body" "valid" "invalid"
fi

# ──────────────────────────────────────────────
echo ""
echo "--- 7. API DOCS ---"
check "swagger-ui" "200" "$(curl -s -o /dev/null -w '%{http_code}' -L "$B/api-docs")"

# ──────────────────────────────────────────────
echo ""
echo "--- 8. CREATE JOB (everyday preset) ---"
JOB_RESP=$(curl -s -X POST -H 'Content-Type: application/json' -H "x-api-key: $K" \
  -d '{"source_url":"'"$VIDEO"'","preset_id":"everyday"}' \
  "$B/v1/jobs")
echo "  Response: $JOB_RESP"
JOB_ID=$(echo "$JOB_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id','') or d.get('id',''))" 2>/dev/null || echo "")
if [[ -n "$JOB_ID" && "$JOB_ID" != "None" ]]; then
  check "job-create" "created" "created"
  echo "  Job ID: $JOB_ID"
else
  check "job-create" "created" "failed"
fi

# ──────────────────────────────────────────────
echo ""
echo "--- 9. POLL JOB TO COMPLETION ---"
FINAL_STATUS="unknown"
if [[ -n "$JOB_ID" && "$JOB_ID" != "None" ]]; then
  for i in $(seq 1 40); do
    sleep 5
    STATUS_RESP=$(curl -s -H "x-api-key: $K" "$B/v1/jobs/$JOB_ID")
    FINAL_STATUS=$(echo "$STATUS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('status','') or d.get('status',''))" 2>/dev/null || echo "")
    printf "  Poll %2d: status=%s\n" "$i" "$FINAL_STATUS"
    if [[ "$FINAL_STATUS" == "completed" || "$FINAL_STATUS" == "failed" ]]; then
      break
    fi
  done

  echo ""
  echo "  Final job response:"
  echo "$STATUS_RESP" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RESP"

  if [[ "$FINAL_STATUS" == "completed" ]]; then
    check "job-complete" "completed" "completed"
    
    # Check for artifacts
    ARTIFACTS=$(echo "$STATUS_RESP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
data = d.get('data', d)
steps = data.get('steps', data.get('pipeline', {}).get('steps', {}))
if isinstance(steps, dict):
    for name, step in steps.items():
        if isinstance(step, dict):
            url = step.get('url') or step.get('artifact_url') or step.get('output_url', '')
            if url:
                print(f'{name}: {url[:80]}...')
" 2>/dev/null || echo "")
    if [[ -n "$ARTIFACTS" ]]; then
      echo "  Artifacts found:"
      echo "$ARTIFACTS" | while read -r line; do echo "    $line"; done
      check "artifacts" "found" "found"
    else
      check "artifacts" "found" "none"
    fi
  else
    check "job-complete" "completed" "$FINAL_STATUS"
  fi
else
  echo "  Skipping poll (no job ID)"
fi

# ──────────────────────────────────────────────
echo ""
echo "--- 10. ALL PRESETS VALIDATION ---"
PRESETS=(everyday adhd autism low_vision color hoh cognitive motion blindness deaf color_blindness epilepsy_flash epilepsy_noise cognitive_load)
for preset in "${PRESETS[@]}"; do
  PRESET_RESP=$(curl -s -X POST -H 'Content-Type: application/json' -H "x-api-key: $K" \
    -d '{"source_url":"'"$VIDEO"'","preset_id":"'"$preset"'"}' \
    "$B/v1/jobs")
  PRESET_CODE=$(echo "$PRESET_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id','') or d.get('id','FAIL'))" 2>/dev/null || echo "FAIL")
  if [[ "$PRESET_CODE" != "FAIL" && "$PRESET_CODE" != "None" && -n "$PRESET_CODE" ]]; then
    check "preset-$preset" "accepted" "accepted"
  else
    check "preset-$preset" "accepted" "rejected: $PRESET_RESP"
  fi
  sleep 1
done

# ──────────────────────────────────────────────
echo ""
echo "============================================"
if [[ $F -eq 0 ]]; then
  printf "  \033[32mRESULTS: %d passed, %d failed — ALL GREEN\033[0m\n" "$P" "$F"
else
  printf "  \033[31mRESULTS: %d passed, %d failed\033[0m\n" "$P" "$F"
fi
echo "============================================"
exit $F
