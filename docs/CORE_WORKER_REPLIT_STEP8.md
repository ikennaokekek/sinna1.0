# SINNA Core worker — Replit Reserved VM readiness (Step 8)

This is a repository and operator contract only. It does not configure, deploy,
publish, or mutate Replit, PostgreSQL, Redis, R2, media providers, Render, or
Stripe. The canonical machine-readable contract is
`infra/replit/core-worker-reserved-vm.yaml`.

## Fixed topology

- Core API remains a public Replit Autoscale deployment in its own project.
- Core worker is a separate, always-on Reserved VM deployment in its own project.
- Onboarding remains separate and owns checkout and plaintext API-key delivery.
- Worker has no HTTP listener, port, API routes, checkout, or migration duties.
- API and worker consume the same approved full revision and `QUEUE_PREFIX`.

Build with `bash infra/replit/build-core-worker.sh`. Run with
`bash infra/replit/run-core-worker.sh`. The launcher validates production
configuration and directly `exec`s `apps/worker/dist/index.js`; build and startup
never run migrations or launch the API.

## Runtime and queue contract

The worker consumes only `captions`, `ad`, `color`, and `video-transform` under
the environment-specific BullMQ `QUEUE_PREFIX`. API producers use the same
prefix and shared default policy: five attempts, exponential backoff beginning
at five seconds, bounded completed/failed retention. Use separate namespaces and
Redis ACL users for every environment. A staging worker must never consume
production queues.

Operational provider, object-store, prerequisite-artifact, and processing errors
throw and remain failed/retryable; they are not converted to successful degraded
completions. Intentionally disabled audio description remains a successful
no-op artifact. Transform jobs are BullMQ Flow parents and cannot run until the
caption, audio-description, and color child jobs complete. Exhausted prerequisite
failure fails the parent. BullMQ lock/stalled recovery is authoritative; artifact
keys are deterministic per tenant/job so retries overwrite the same key.

The 24-hour API Redis idempotency cache reduces normal duplicate submissions;
BullMQ processing remains at-least-once. Before a processor returns success it
transactionally claims `(queue_name, job_id)` in PostgreSQL and updates usage only
for the first claim, so worker retries cannot double-count completion. Operators
must still retain failed jobs for diagnosis and reconcile abandoned API requests.

## Startup, readiness, heartbeat, and shutdown

Production startup fails if environment validation, PostgreSQL, or Redis fails.
The trusted CLI probe `node apps/worker/dist/readiness.js` checks configuration,
PostgreSQL, Redis, a fresh ready heartbeat, writable local scratch, and FFmpeg.
It opens no HTTP port. Heartbeats are refreshed every 15 seconds with a 45-second
TTL at `<QUEUE_PREFIX>:worker:heartbeat:<WORKER_INSTANCE_ID>` and transition
through `starting`, `ready`, and `draining`.

SIGTERM/SIGINT is idempotent: stop heartbeat refresh, mark draining, close
workers (which stop claiming work and wait for active jobs), then close events,
queues, PostgreSQL, and Redis. `WORKER_SHUTDOWN_TIMEOUT_MS` bounds the drain;
timeout or cleanup failure exits nonzero so the platform does not mistake an
unclean stop for success. Worker, queue-event, stalled-job, job-failure,
heartbeat, and shutdown errors are emitted as structured events.

Reserved VM disk may exist for the life of a deployment but is reset on
republish. Only temporary media scratch may use it; R2/PostgreSQL/Redis remain
authoritative. Size disk, CPU, RAM, `WORKER_CONCURRENCY`, provider quotas, and
timeouts for the largest permitted media workload.

## Least-privilege configuration

Required worker secrets: `DATABASE_URL`, `REDIS_URL`, R2 credentials/bucket,
`ASSEMBLYAI_API_KEY`, `OPENAI_API_KEY`, and `CLOUDINARY_URL`. Required ordinary
configuration: `DATABASE_SSL_MODE`, `QUEUE_PREFIX`, `WORKER_INSTANCE_ID`,
`WORKER_CONCURRENCY`, `WORKER_SHUTDOWN_TIMEOUT_MS`, and exact `REVISION`.

Do not provide `SESSION_SECRET`, `REPLIT_SYNC_SECRET`, Stripe credentials, API
admin/seed credentials, or migration credentials. Use a worker PostgreSQL role,
worker Redis ACL, and R2 credential limited to required artifact prefixes.

## Validation and manual deployment actions

Run `pnpm validate:core-worker-vm`, `pnpm test:core-worker-vm`, and
`pnpm readiness:worker` from a trusted context. Local disposable validation may
exercise PostgreSQL/Redis, heartbeat age, namespace isolation, retry/failure,
startup failure, sustained heartbeat refresh, and SIGTERM. It must not call real
R2/media providers.

Before publication, an operator must:

1. Create/import a dedicated worker Replit project at the approved revision.
2. Select Reserved VM and configure the checked-in build/run commands.
3. Choose region and fixed CPU/RAM/disk for worst-case FFmpeg/media concurrency.
4. Add worker-only Deployment Secrets; workspace secrets do not transfer.
5. Provision least-privilege worker PostgreSQL, Redis ACL, R2, and provider roles.
6. Set the exact same `QUEUE_PREFIX` as the matching API and no other environment.
7. Confirm network reachability, DNS/TLS, CA trust, allowlists, and egress policy.
8. Run approved explicit migrations separately before allowing work.
9. Run non-mutating provider/R2 preflight or synthetic checks with real credentials.
10. Configure log retention, failed/stalled queue alerts, heartbeat monitoring,
    resource/disk alerts, restart alerts, and an on-call/rollback procedure.

Do not publish until the historically exposed sync secret is rotated and purged
from Git history. The worker must never receive that secret.