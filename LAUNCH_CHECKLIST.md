## Launch Readiness Checklist

Use this checklist to track everything needed to reach 100% and launch safely. Fill in the placeholders as you complete items.

### 1) Infrastructure
- [ ] Postgres provisioned (managed) and reachable from Render
  - DATABASE_URL: `postgres://<user>:<pass>@<host>:<port>/<db>`
- [ ] Upstash Redis (or equivalent) provisioned
  - REDIS_URL: `rediss://default:<token>@<host>:6379`
- [ ] Cloudflare R2 bucket created
  - R2_ACCOUNT_ID: `__account_id__`
  - R2_ACCESS_KEY_ID: `__access_key__`
  - R2_SECRET_ACCESS_KEY: `__secret__`
  - R2_BUCKET: `sinna1-0` (or your bucket name)

### 2) Environment Variables (Render → Service → Environment)
- [ ] DATABASE_URL = `postgresql://USER:PASS@HOST:PORT/DB`
- [ ] REDIS_URL = `rediss://default:PASSWORD@HOST:PORT`
- [ ] R2_ACCOUNT_ID=__account_id__
- [ ] R2_ACCESS_KEY_ID=__access_key__
- [ ] R2_SECRET_ACCESS_KEY=__secret__
 - [ ] R2_BUCKET=sinna1-0
 - [ ] OPENAI_API_KEY=sk-...
 - [ ] ASSEMBLYAI_API_KEY=...
- [ ] CORS_ORIGINS = `https://app.<yourdomain>,https://admin.<yourdomain>`
- [ ] RUN_MIGRATIONS_ON_BOOT = `1`
- [ ] FEATURE_REALTIME = `0`
- [ ] GPU_PROVIDER = `none`
- [ ] API_RATE_LIMIT = `1000`
- [ ] STATUS_PAGE_URL = `https://status.<yourdomain>`
- [ ] (Optional) STRIPE_SECRET_KEY=sk_live_...
- [ ] (Optional) STRIPE_WEBHOOK_SECRET=whsec_...
- [ ] (Optional) SENTRY_DSN=https://...@sentry.io/...

### 3) Seeding (Tenants + API Key)
Run locally (or in Render shell) after DATABASE_URL is set.

```bash
# Choose a plaintext API key you will share with clients/integrations
export DATABASE_URL="postgresql://USER:PASS@HOST:PORT/DB"
export API_KEY="sk_test_your_key"
export TENANT_NAME="Your Org"
export PLAN="standard"

pnpm -C apps/api build && pnpm -C apps/api seed
# Output will include tenantId and stored key hash; keep API_KEY secure
```

### 4) Deploy via Render (Blueprint)
- [ ] GitHub repo connected to Render (Blueprint)
- [ ] Apply `render.yaml`
- [ ] Verify both services healthy:
  - [ ] API service (web) starts and `/health` = 200
  - [ ] Worker service (background) starts and connects to Redis

### 5) Smoke Tests (Post-deploy)
```bash
BASE_URL="https://<your-app>.onrender.com"
API_KEY="sk_test_your_key"

# Health
curl -sSf $BASE_URL/health

# API Docs
curl -sSf $BASE_URL/api-docs | head -n 1

# Create a job
curl -sS -H "x-api-key: $API_KEY" -H 'content-type: application/json' \
  -d '{"source_url":"https://example.com/video.mp4"}' \
  "$BASE_URL/v1/jobs"

# Poll job status
curl -sS "$BASE_URL/v1/jobs/<job_id_from_previous_response>"
```

### 6) Observability & Security
- [ ] Sentry DSN set (if desired) and error ingestion validated
- [ ] UptimeRobot monitor on `/health` (1-minute interval)
- [ ] Prometheus metrics accessible at `/metrics` (validate scrape/visibility)
- [ ] API key rotation plan documented (frequency, procedure)
- [ ] Secrets rotated if any were committed historically (done)

### 7) Final Hardening
- [ ] CORS domains finalized and verified
- [ ] STATUS_PAGE_URL points to live status page
- [ ] Rate limits configured for your plan(s)
- [ ] RUNBOOKS updated for incident workflows

### Notes / Decisions
- Deprecated packages removed: fluent-ffmpeg; `sharp` upgraded to 0.34.x
- Security advisories: tar-fs patched via overrides; monitor fast-redact advisory and update fastify/pino when upstream patch is available

### Owners
- Product/Eng Owner: ______________________
- Ops Owner: ______________________________
- On-call/SRE: ____________________________


