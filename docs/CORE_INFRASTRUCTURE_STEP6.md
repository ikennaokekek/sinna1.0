# SINNA Core infrastructure — Step 6

This is the canonical architecture and operator contract. It is repository-only:
`infra/replit/core-deployment-units.yaml` does **not** create, configure, deploy,
publish, or mutate any live service.

## Deployment boundary and promotion

Two independently configured, dedicated Replit project/deployment contexts
consume the same approved full Git SHA: `core-api` is a stateless **Autoscale**
public-ingress service; `core-worker` is an always-on **Reserved VM** (`vm`)
with no public ingress. Replit applies one deployment type to a project, so do
not try to combine these units into one published project.
Use the build/run commands in the contract. Builds use pinned pnpm 10.26.1 and
frozen lockfile; runs `exec` compiled `dist` output and never install or migrate.
Validate it with `pnpm validate:core-infra`. Promote the exact tested revision
to both units, record it as `REVISION`, and roll back both to a previously
verified exact revision. Migrations are a separate, approved, backed-up
operation—not deployment startup or rollback.
The protected production approval job cannot begin until GitHub reports a
successful `integration-e2e-staging` check on that exact revision.

## Ownership and network boundary

Onboarding is a separate service and the only owner of checkout and plaintext
key delivery. Core only authenticates sync with `REPLIT_SYNC_SECRET` and handles
authenticated sync/runtime authorization; it must not have `SESSION_SECRET`.
Public Internet ingress terminates at API only. Worker has no public listener;
it receives jobs only through its private Redis queue namespace. API egress is
limited to its required database/cache/object store and actually-used providers;
worker egress additionally reaches media/AI providers it processes. Do not put
media-provider credentials in API unless that API code genuinely uses them.

## Dependency and secret matrix

| Dependency / secret | API Autoscale | Worker Reserved VM | Onboarding |
| --- | --- | --- | --- |
| PostgreSQL (`DATABASE_URL`, `DATABASE_SSL_MODE`) | Core runtime role | worker runtime role | provisioning role only if needed |
| Redis (`REDIS_URL`) | API rate-limit/queue producer ACL | worker-consumer/heartbeat ACL | none by default |
| R2 S3-compatible (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) | signed-object feature only | artifact prefix read/write | none |
| AI/media credentials | only feature-specific | processors that need them | none |
| `REPLIT_SYNC_SECRET` | verify sync | no | send sync |
| checkout and `SESSION_SECRET` | no | no | yes |

Use distinct least-privilege Postgres roles (API, worker, migrations), Redis ACL
users with separate API/worker command permissions, and namespaced keys/queues
(`QUEUE_PREFIX`, then `captions`, `ad`, `color`, `video-transform`). Use distinct
S3-compatible R2 credentials and bucket prefixes per environment and process.
The existing R2 names are compatibility names for this S3-compatible contract;
do not broadly rename them. Never share staging and production credentials.
Set `DATABASE_SSL_MODE` explicitly for both Replit units: prefer `verify-full`
when the provider supplies a trusted certificate chain, use `require` only when
encrypted transport cannot be CA-verified, and use `disable` only on a
documented trusted private network. The API, worker, and readiness probe share
this contract.

## Runtime operation

`GET /health` is unauthenticated lightweight liveness. `GET /readiness` is
unauthenticated, bounded, and fails closed with HTTP 503 unless PostgreSQL and
Redis are reachable; it returns only named check states, never connection
details or secrets. R2/object-store validation is startup/preflight or synthetic
monitoring, never an every-request readiness network call. Production startup
requires valid configuration plus PostgreSQL and Redis; development/test retain
convenient behavior. API and worker drain on SIGTERM/SIGINT with a bounded
timeout, closing available Fastify, queue, worker, QueueEvents, Redis, and
Postgres handles; timeout exits nonzero.

Workers publish expiring `<QUEUE_PREFIX>:worker:heartbeat:<instance>` records with
identity, `starting`/`ready`/`draining` state, revision and queue names. Run
`pnpm readiness:worker` from a trusted operator context to verify configuration,
Postgres, Redis, and a fresh ready heartbeat. It prints status only, not secrets.

Structured Fastify/Node stdout/stderr is the baseline observability path.
`SENTRY_DSN` remains optional where already compatible; `OTEL_SERVICE_NAME` is
metadata only—this repository adds no vendor SDK or live telemetry integration.
Core does not expose a checkout-session creation route. Any checkout link or
plaintext API-key delivery is an onboarding responsibility. Core may process
properly signed lifecycle notifications and authenticated normalized tenant
sync without taking ownership of checkout.

## Account-level operator blockers

Before an operator configures the two units, resolve account permissions to
create Autoscale and Reserved VM deployments, static egress/network policy,
private Postgres/Redis/R2 reachability, custom domain/TLS, encrypted secret
management, Redis ACL and database-role provisioning, budget/quotas, and
on-call/synthetic-monitoring ownership. None is solved by this repository
change. `render.yaml` remains `autoDeploy: false` for all services and Render
must not be enabled for this topology.