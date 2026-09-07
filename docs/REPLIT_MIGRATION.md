# SINNA Replit Migration

## Current Architecture

This repository is a Node.js monorepo using pnpm workspaces.

- API: `apps/api` (Fastify + TypeScript)
- Worker: `apps/worker` (BullMQ worker + TypeScript)
- Shared schema/validation: `packages/types`
- Database: PostgreSQL
- Queue/cache: Redis via BullMQ and ioredis
- Storage: Cloudflare R2
- Media processing: Cloudinary and FFmpeg-based fallback logic in the worker
- Auth: API key + tenant lookup in PostgreSQL; Stripe billing and webhook handling

## Runtime Requirements

- Node.js 20 LTS
- pnpm 9+
- PostgreSQL 15+
- Redis 7+
- Optional but recommended for media transforms: Cloudinary and FFmpeg in the runtime image
- Internet access for external provider APIs (AssemblyAI, OpenAI, Stripe, Cloudflare)

## Install Command

```bash
pnpm install --frozen-lockfile
```

## Development Start Command

```bash
pnpm dev
```

This starts the API in `apps/api` using `tsx watch src/index.ts`.

## Production Start Command

```bash
pnpm start
```

This runs the built API server:

```bash
node apps/api/dist/index.js
```

The worker should be started separately in a second process:

```bash
pnpm start:worker
```

## Build Command

```bash
pnpm build
```

This runs:

```bash
pnpm -C packages/types build && pnpm -C apps/api build && pnpm -C apps/worker build
```

## Test Commands

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

Local integration tests expect a live API at `http://127.0.0.1:4000` or `E2E_BASE_URL`.

## Required Environment Variables

List of variable names, no secret values:

- NODE_ENV
- PORT
- BASE_URL
- BASE_URL_PUBLIC
- BASE_URL_PRIVATE
- CORS_ORIGINS
- TRUST_PROXIES
- TRUSTED_CIDRS
- DATABASE_URL
- REDIS_URL
- SEED_API_KEY_SECRET
- R2_ACCOUNT_ID
- R2_ACCESS_KEY_ID
- R2_SECRET_ACCESS_KEY
- R2_BUCKET
- CLOUDINARY_URL
- ASSEMBLYAI_API_KEY
- OPENAI_API_KEY
- OPEN_ROUTER_QWEN_KEY
- PROVIDER_CAPTIONS
- PROVIDER_TTS
- PROVIDER_CAPTIONS_VOD
- JWT_SECRET
- API_RATE_LIMIT
- ADMIN_API_KEY
- WEBHOOK_SIGNING_SECRET
- WEBHOOK_HMAC_HEADER
- REPLIT_SYNC_SECRET
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- STRIPE_STANDARD_PRICE_ID
- GRACE_DAYS
- NOTIFY_FROM_EMAIL
- NOTIFY_FALLBACK_EMAIL
- RESEND_API_KEY
- SENDGRID_API_KEY
- SENTRY_DSN
- GRAFANA_PROM_PUSH_URL
- FEATURE_REALTIME
- GPU_PROVIDER
- API_KEY
- TEST_API_KEY
- E2E_BASE_URL

## External Services

- PostgreSQL database
- Redis
- Cloudflare R2
- Cloudinary
- AssemblyAI
- OpenAI
- Stripe
- Resend or SendGrid for email delivery
- Sentry for observability

## Database Requirements

- PostgreSQL database is required for tenant and API key lookups.
- Automatic migrations live under `apps/api/migrations`.
- The app checks database health on startup. Run migrations explicitly; startup never runs migrations.
- For a brand-new, empty database, run `pnpm migrate:bootstrap`, then
  `pnpm migrate:apply` and `pnpm migrate:verify`. Bootstrap is intentionally
  refused when a migration ledger, public user object, or unknown schema exists;
  it is for disposable/new databases only.
- For an existing database that already has the historical 001–008 schema, run
  `pnpm migrate:baseline` (with its explicit confirmation flags), then apply
  and verify. Baseline first checks the exact historical fingerprint, records
  only the ledger atomically, and never executes historical SQL.

## Media/System Dependencies

The worker contains FFmpeg-based fallback logic for video transformation and caption overlays. Replit may need a runtime image that includes:

- FFmpeg
- proper temp-space access for processing media files
- write access to `/tmp` for intermediate video operations

Cloudinary is used for transformation and analysis when configured; the worker also falls back to FFmpeg where advanced filters are required.

## Required Replit Configuration

- Run the API as a Node.js web service.
- Run the worker as a separate Node.js process or background worker.
- Add env vars from the template with real values.
- Set a fixed `PORT` value for the web service (the project defaults to 4000 locally).
- Ensure Redis and PostgreSQL are provisioned and reachable from the Replit environment.
- If using Replit-managed secrets, keep them in the project environment rather than in the repository.

## Ports / Networking

- Default API port: `4000`
- Health endpoint: `/health`
- Swagger docs: `/api-docs`
- Webhook endpoint: `/webhooks/stripe`
- Sync endpoint: `/v1/sync/tenant`

Replit deployments should keep the web service listening on the port assigned by the environment, but the app still expects `PORT` in the environment and defaults to `4000` for local configuration.

## Workers / Background Jobs

- BullMQ workers are used for `captions`, `ad`, `color`, and `video-transform` queues.
- The worker process must remain running in parallel with the API.
- Redis connectivity is required for queue processing.
- If Redis is unavailable, the worker idles and the API continues in degraded mode.

## Persistent Storage Requirements

- PostgreSQL for relational data
- Redis for job queues and rate limiting
- Cloudflare R2 or compatible object storage for uploaded media artifacts
- Temporary file system for video processing; `/tmp` is used by worker logic

## Webhooks / Callback URLs

- Stripe webhook endpoint: `/webhooks/stripe`
- Replit sync endpoint: `/v1/sync/tenant`
- Any public callback URL must be set to the deployed API host and match the configured webhook secret.

## Known Migration Risks

- The project is built around separate API and worker processes; Replit must run both.
- Local file paths and developer-only assumptions are present in documentation and scripts but are not required for the application code itself.
- FFmpeg/media transforms depend on runtime support; a missing binary will degrade, not crash, some advanced transforms.
- The app expects valid PostgreSQL and Redis connectivity for queue-driven jobs.
- Some scripts and documentation refer to Render, but the app code itself is portable and uses env-based configuration.

## Post-Import Verification Checklist

- Confirm `pnpm install --frozen-lockfile` succeeds.
- Confirm `pnpm build` succeeds.
- Start the API and worker with the configured environment variables.
- Call `/health` and verify unauthenticated behavior.
- Validate authenticated access using a seeded API key.
- Confirm database migrations run successfully.
- Confirm Redis queue workers connect and process at least one job.
- Confirm Stripe webhook route responds with expected verification behavior.
- Confirm R2 signed URL generation works.
- Confirm a job submission endpoint accepts a valid request and returns a job ID.
- Confirm E2E smoke tests pass against the migrated deployment.
