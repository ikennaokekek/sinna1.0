# SINNA Core environment rebuild manifest

This is the provider-neutral source of truth for environment configuration. The
repository-only Replit unit contract is `infra/replit/core-deployment-units.yaml`;
it creates or configures no live deployment. Copy
`env.example` into a local secret mechanism and replace every placeholder there;
do not commit populated values. “Required” means required for the stated process
or feature, not that every optional feature must be enabled. No startup path runs
database migrations.

## Runtime variables

| Variable | Classification | Runtime behavior |
| --- | --- | --- |
| `NODE_ENV` | Optional (defaults to `development`) | `production` enables strict validation and production behavior; `test` enables test behavior. |
| `PORT` | Optional (API listener default is `4000`) | API listen port. |
| `DATABASE_URL` | **Required in production** | PostgreSQL connection for API, worker, and migration command. |
| `DATABASE_SSL_MODE` | **Required for Replit production units** | `disable` for an explicitly trusted private network, `require` for encrypted transport without CA verification, or `verify-full` for verified TLS. API, worker, readiness, and migration operators must use the provider-appropriate mode. |
| `DB_POOL_MAX` | Recommended API Autoscale configuration (default `5`) | Maximum PostgreSQL connections per API instance; accepted range is 1–20. Size it so maximum Autoscale instances × this value remains below the API role’s database connection budget. |
| `DB_POOL_MIN` | Recommended API Autoscale configuration (default `0`) | Minimum retained PostgreSQL connections per API instance; accepted range is 0–`DB_POOL_MAX`. Keep `0` for scale-to-zero unless measured latency justifies otherwise. |
| `QUEUE_PREFIX` | API and worker, required in production | Environment-specific BullMQ namespace shared by the matching API producer and worker consumer. Never share between staging and production. |
| `REDIS_URL` | **Required in production** | Queue and shared rate-limit connection. Development/test can use in-memory fallbacks. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | **Required in production** | Object-storage account, credentials, and bucket. The endpoint is derived from the account ID; there is no `R2_ENDPOINT` setting. |
| `CLOUDINARY_URL` | **Required for the production worker only** | Media-transform service connection. It is not passed to the public API. |
| `ASSEMBLYAI_API_KEY` | Conditional worker-only required | Caption/transcription provider credential. Worker production validation requires this or `OPENAI_API_KEY`; it is not passed to the API. |
| `OPENAI_API_KEY` | Conditional worker-only required | AI/TTS provider credential. Worker production validation requires this or `ASSEMBLYAI_API_KEY`; it is not passed to the API. |
| `OPEN_ROUTER_QWEN_KEY` | Conditional required | Vision-instruction provider credential. Required only when a Qwen instruction request is made. |
| `BASE_URL` | Optional, legacy-compatible | API base URL used by some runtime and utility paths. Prefer `BASE_URL_PUBLIC` where a public URL is needed. |
| `BASE_URL_PUBLIC` | Optional but required for correct public links | Public API/application URL used in API responses and provider referer metadata. |
| `BASE_URL_PRIVATE` | Optional compatibility setting | Accepted by validation for private/internal URL configuration; Core does not currently read it directly. |
| `CORS_ORIGINS` | **Required in production** | Comma-separated browser origins. Empty production configuration rejects all origins and aborts startup. |
| `TRUST_PROXIES` | Optional (default `0`) | Set exactly `1` to trust proxy headers. |
| `TRUSTED_CIDRS` | Optional | Comma-separated trusted CIDRs for rate-limit handling. |
| `STATUS_PAGE_URL` | Optional | Status URL exposed by the API. |
| `SENTRY_DSN` | Optional | Error-monitoring DSN; monitoring is disabled when absent. |
| `OTEL_SERVICE_NAME` | Optional | Naming metadata for a compatible collector/host; no collector or vendor SDK is configured here. |
| `REVISION` | Required by release procedure | Approved full Git SHA recorded in API/worker logs and worker heartbeat. |
| `WORKER_INSTANCE_ID` | Worker-only, required | Stable unique worker heartbeat identity. |
| `WORKER_CONCURRENCY` | Worker-only, required | Per-queue concurrency from 1–16; size against CPU, memory, provider, and database limits. |
| `WORKER_SHUTDOWN_TIMEOUT_MS` | Worker-only, required | Graceful-drain deadline from 10000–300000 milliseconds. |
| `REPLIT_SYNC_SECRET` | Required for `/v1/sync/tenant` | Shared secret compared in constant time with the `x-sync-secret` header. Missing it rejects sync requests; IP allowlists are not an authentication alternative. |
| `STRIPE_SECRET_KEY` | Development/test only | Non-production payment-provider client credential. Core does not create checkout sessions. |
| `STRIPE_WEBHOOK_SECRET` | Development/test only | Non-production webhook signing secret. |
| `STRIPE_SECRET_KEY_LIVE` | Conditional production requirement | The only Stripe client credential Core uses in production; no generic-key fallback. |
| `STRIPE_WEBHOOK_SECRET_LIVE` | Conditional production requirement | The only Stripe webhook secret Core accepts in production; no generic-secret fallback. |
| `GRACE_DAYS` | Optional (default `7`) | Strict integer from `0` through `14` applied after a failed invoice payment. |
| `NOTIFY_FROM_EMAIL` | Optional (runtime fallback exists) | Sender for notification email. |
| `NOTIFY_FALLBACK_EMAIL` | Optional | Operations/fallback recipient for payment and cancellation notices. |
| `RESEND_API_KEY` | Optional | Preferred email-provider credential. |
| `SENDGRID_API_KEY` | Optional | Fallback email-provider credential if the preferred credential is absent. |
| `ADMIN_ENDPOINTS_ENABLED` | Optional | In production, admin endpoints require the exact value `1`; they are otherwise disabled. |
| `ADMIN_API_KEY` | Required when admin access is enabled/used | Shared key for admin authorization. |
| `SEED_API_KEY_SECRET` | Required for production seed operation | Secret used to deterministically derive the seeded tenant API key; production seeding fails without it. |
| `TENANT_NAME` | Optional (seed script default exists) | Name used by the API seed script. |
| `PLAN` | Optional (seed script default is `standard`) | Plan assigned by the API seed script. |
| `JWT_SECRET` | Test-only compatibility setting | Local verification scripts export it, but current Core runtime does not consume it. |

## Payment and provisioning semantics

Core does not create payment-provider checkout sessions. A
`checkout.session.completed` webhook is authenticated and durably acknowledged,
**but it does not provision a tenant, rotate/create an API key, or send a key
email**. Onboarding owns provisioning and uses `/v1/sync/tenant`, authenticated
by `REPLIT_SYNC_SECRET`. Subscription lifecycle webhooks update an already
associated tenant.

Normal webhook processing always requires a raw request body, payment client,
webhook secret, and valid provider signature. `STRIPE_TESTING=true` bypasses
signature construction **only when `NODE_ENV=test`**; it has no production-like
bypass effect.

## Migration and test-only variables

| Variable | Classification | Behavior |
| --- | --- | --- |
| `TEST_MIGRATION_DATABASE_URL` | Test-only, required to enable migration-ledger integration test | Connection URL for a disposable PostgreSQL database. |
| `CONFIRM_DISPOSABLE_MIGRATION_DATABASE` | Test-only, required with the preceding variable | Must equal `YES`; otherwise that destructive integration test is skipped. |
| `VITEST` | Test-only | Exact `true` enables test-specific database cleanup behavior. |
| `STRIPE_TESTING` | Test-only | See hardened webhook restriction above. |
| `HOST` | Test-only internal setting | TCP probe host used inside the local integration runner. |
| `CI_TEST_API_KEY` | Optional test-only | Local integration tenant key; its runner provides a default. |
| `RUN_E2E` | Optional test-only (default `1`) | Set `0` to skip E2E in the local integration runner. |
| `SINNA_IT_PG_PORT`, `SINNA_IT_RD_PORT` | Optional test-only | Local integration PostgreSQL/Redis port overrides. |
| `SINNA_LOCAL_PG_PORT`, `SINNA_LOCAL_RD_PORT` | Optional development-only | Persistent local PostgreSQL/Redis port overrides. |

Run migrations as an explicit migration command with `DATABASE_URL`; startup does
not migrate. On a new empty disposable database use `pnpm migrate:bootstrap`,
then `pnpm migrate:apply` and `pnpm migrate:verify`. Bootstrap executes the
immutable 001–008 history only after refusing an existing ledger, public user
objects, or unknown schemas. On an existing historical database, use the
explicitly confirmed `pnpm migrate:baseline` instead: it verifies the
fingerprint and writes ledger rows but never executes historical SQL.

## Smoke, verification, and manual-operation variables

| Variable | Classification | Used by |
| --- | --- | --- |
| `STAGING_E2E_BASE_URL` | Staging-only secret/configuration | Required HTTPS URL for `pnpm smoke:staging`; it must match `STAGING_ALLOWED_HOST`. |
| `STAGING_E2E_API_KEY` | Staging-only secret | Required API key for `pnpm smoke:staging` and remote staging E2E. Never reuse it in production. |
| `STAGING_ALLOWED_HOST` | Staging-only configuration | Required exact hostname for remote staging validation. Production, localhost, and IP targets are rejected. |
| `API_BASE_URL`, `E2E_BASE_URL`, `API_KEY`, `TEST_API_KEY` | Other operational/test scripts | Use only where their individual script documents them; they are not accepted by the staging smoke command. |
| `TEST_VIDEO_URL` | Optional test-only | Public media URL; scripts have a sample fallback. |
| `PRESET_ID` | Optional test-only | Smoke preset; default is `everyday`. |
| `PRESETS_CSV` | Optional test-only | Manual-flow preset list; default is `everyday`. |
| `SMOKE_POLL_INTERVAL_SEC`, `SMOKE_POLL_TIMEOUT_SEC` | Optional test-only | Poll interval (default `5`) and timeout (default `600`) in seconds. |
| `SKIP_JOBS` | Optional test-only | Manual-flow switch; exact `1` skips that portion. |
| `TEST_EMAIL` | Conditional test-only | Recipient for checkout/email utility scripts. |
| `WEBHOOK_URL` | Optional test-only | Webhook utility target; its script has a default. |
| `STRIPE_LIVE_SECRET_KEY`, `STRIPE_LIVE_PRICE_ID` | Conditional operational | Explicit production credentials for payment utility scripts, separate from Core runtime overrides. |
| `RENDER_API_KEY` | Conditional operational secret | Host control-plane credential used only by the watchdog. |
| `RENDER_SERVICE_ID`, `RENDER_API_SERVICE_ID`, `RENDER_SERVICE`, `render_service_id` | Conditional operational | Watchdog service identifier aliases, checked in that order. |
| `SLACK_WEBHOOK_URL` | Optional operational secret | Watchdog alert delivery endpoint. |

`WEBHOOK_SIGNING_SECRET` and `WEBHOOK_HMAC_HEADER` remain accepted by the shared
validation schema for compatibility, but current Core routes do not consume
them. They are not required configuration.

## Security and deployment notes

Use any provider’s encrypted environment/secret facility; this project is not
coupled to a particular host. Keep credentials distinct per environment, rotate
them on exposure, and restrict production `CORS_ORIGINS`. `env.example` contains
placeholders only and is safe to version-control; populated `.env` files are not.

Staging and production require separate credentials and resources. API readiness
is unauthenticated, bounded, and returns only named PostgreSQL/Redis checks; it
returns 503 unless both are available. `/health` is unauthenticated liveness
only. Object-store checks belong to startup/preflight or synthetic monitoring,
not the readiness request. Remote
staging E2E is staging-only and never targets production. Production migrations
are explicit approved commands; application startup does not migrate.