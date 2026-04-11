#!/bin/bash
# Test all 14 presets individually and report per-step status
set -euo pipefail

K="sinna-e2e-test-1775781134"
B="http://127.0.0.1:4000"
VIDEO="https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"

PRESETS=(everyday adhd autism low_vision color hoh cognitive motion blindness deaf color_blindness epilepsy_flash epilepsy_noise cognitive_load)

echo "=============================================="
echo "  SINNA 14-PRESET DEEP E2E TEST"
echo "=============================================="
echo ""

for preset in "${PRESETS[@]}"; do
  echo "--- [$preset] ---"
  
  # Create job
  CREATE_RESP=$(curl -s -X POST -H 'Content-Type: application/json' -H "x-api-key: $K" \
    -d "{\"source_url\":\"$VIDEO\",\"preset_id\":\"$preset\"}" "$B/v1/jobs")
  
  JOB_ID=$(echo "$CREATE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null || echo "")
  
  if [[ -z "$JOB_ID" ]]; then
    echo "  CREATE FAILED: $CREATE_RESP"
    echo ""
    continue
  fi
  
  STEPS=$(echo "$CREATE_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin).get('data',{}).get('steps',{})
print(' '.join(d.keys()))
" 2>/dev/null || echo "?")
  echo "  Created job=$JOB_ID steps=[$STEPS]"
  
  # Poll
  FINAL=""
  for i in $(seq 1 40); do
    sleep 3
    POLL=$(curl -s -H "x-api-key: $K" "$B/v1/jobs/$JOB_ID")
    STATUS=$(echo "$POLL" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('status',''))" 2>/dev/null || echo "?")
    if [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]]; then
      FINAL="$POLL"
      break
    fi
  done
  
  if [[ -z "$FINAL" ]]; then
    echo "  TIMEOUT after 120s"
    echo ""
    continue
  fi
  
  # Parse step results
  python3 -c "
import sys, json
data = json.loads('''$FINAL''').get('data', {})
status = data.get('status', '?')
steps = data.get('steps', {})
print(f'  Status: {status}')
for name, info in steps.items():
    s = info.get('status', '?')
    d = ' (degraded)' if info.get('degraded') else ''
    u = ' has_url' if info.get('url') else ''
    print(f'    {name}: {s}{d}{u}')
" 2>/dev/null || echo "  Parse error"
  
  echo ""
done

echo "=============================================="
echo "  DONE"
echo "=============================================="
