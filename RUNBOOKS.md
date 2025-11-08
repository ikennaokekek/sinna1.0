# Runbooks

These runbooks document minimal operational steps during outages.

## Stripe Down

- Impact: Billing webhooks may fail; subscription updates delayed; new checkouts fail
- Immediate actions:
  - Set `ALLOW_UNPAID=true` temporarily to allow POST endpoints
  - Monitor for 402 responses and customer impact
  - Queue failed webhooks for retry
- After recovery:
  - Re-enable normal gating (unset `ALLOW_UNPAID`)
  - Reconcile invoices and usage
  - Verify webhook delivery in Stripe dashboard

## Cloudflare R2 Down

- Impact: Signed URL generation and media reads may fail
- Immediate actions:
  - Return 503 with `Retry-After` for storage endpoints
  - Pause jobs that depend on storage I/O
  - Increase queue retention
- After recovery:
  - Resume jobs and backfill artifacts
  - Validate R2 credentials and bucket health

## Redis Down

- Impact: Queueing, rate limit, and idempotency cache degraded
- Immediate actions:
  - Switch to stub queues in API (already handled)
  - Disable rate limiting temporarily
  - Reduce enqueue load
- After recovery:
  - Reconnect workers
  - Drain DLQs if any and re-enqueue
  - Review queue depth and processing latency

## Monitoring & Alerts

- Sentry: ensure `SENTRY_DSN` is set; verify error spikes
- UptimeRobot: monitor `/health` endpoint for 200 OK
- Status page: keep `STATUS_PAGE_URL` updated; API returns it via `X-Status-Page`

---

## Seeding Tenants & API Keys

Prereqs: `DATABASE_URL` must be set.

1) Choose an API key (store securely):
```bash
export API_KEY="sk_test_your_key"
export TENANT_NAME="Your Org"
export PLAN="standard"
```

2) Run migrations and seed:
```bash
pnpm -C apps/api build
pnpm -C apps/api seed
```

Output will include the `tenantId` and the SHA-256 hash stored in DB.

## Local Development

```bash
cp env.example .env
# Fill required values (DATABASE_URL, REDIS_URL, R2_*...)

pnpm -C apps/api build && pnpm -C apps/worker build
node apps/api/dist/index.js &
node apps/worker/dist/index.js &

curl http://localhost:4000/health
```

## Render Deployment (Blueprint)

1) Push repo to GitHub
2) In Render, New → Blueprint, connect repo (uses `render.yaml`)
3) Add env vars from `render-env-vars.txt` (placeholders) and your secrets
4) Deploy; ensure both services start and `/health` passes

## Smoke Tests

- Health: `GET /health` → 200
- Docs: `GET /api-docs`
- Queue a job:
```bash
curl -H "x-api-key: $API_KEY" -H 'content-type: application/json' \
  -d '{"source_url":"https://example.com/video.mp4"}' \
  "$BASE_URL/v1/jobs"
```
- Poll status: `GET /v1/jobs/{id}`
