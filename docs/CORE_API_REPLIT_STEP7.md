# SINNA Core API on Replit Autoscale — Step 7

This is a repository-only deployment-readiness contract. No Replit deployment,
publication, external provider, or production data is configured by these
instructions.

## Replit target

Create the Core API as a dedicated Replit project using **Autoscale**. Current
Replit deployment settings apply one deployment type per project, so the
always-on worker must remain a different Replit project using Reserved VM.
Onboarding also remains separate. All units must be promoted from the same
approved full Git revision when compatibility requires a coordinated release.

Use:

- Build: `bash infra/replit/build-core-api.sh`
- Run: `bash infra/replit/run-core-api.sh`
- Target: Autoscale
- Public port: Replit-provided `PORT`
- Liveness: `GET /health`
- Dependency readiness: `GET /readiness`

The launcher requires an integer `PORT`, binds Fastify to `0.0.0.0:$PORT`, sets
`NODE_ENV=production`, validates an exact lowercase 40-character `REVISION`,
and executes compiled output directly. Build and run commands never migrate.

## Autoscale behavior

The API is request-serving only: it creates BullMQ queue producers but no
workers or background consumers. Authoritative state is in PostgreSQL, Redis,
and the S3-compatible object store. Process-local metrics, request tracking,
and tenant cache entries are non-authoritative and may disappear when an
instance scales down. Runtime filesystem persistence is not permitted.

`/health` is public, detail-free liveness. `/readiness` checks PostgreSQL and
Redis concurrently with bounded probes and returns 503 if either is down.
Startup fails nonzero if either dependency is unavailable. API database and
Redis initial connection deadlines are kept below Replit's documented
five-second health-response expectation, and one 4.5-second absolute deadline
bounds the complete pre-listen startup sequence. R2 connectivity is feature-scoped and
must be checked during operator preflight or synthetic monitoring rather than
on every readiness request.

PostgreSQL defaults to zero retained connections and five maximum connections
per API instance. Set `DB_POOL_MAX` and `DB_POOL_MIN` explicitly after applying:

`maximum Autoscale instances × DB_POOL_MAX < API database role connection limit`

Reserve headroom for migrations, the worker, monitoring, and failover.

## API-only configuration and secrets

Required configuration:

- `PORT` (injected by Replit), `REVISION`, `DATABASE_SSL_MODE`
- `CORS_ORIGINS`, `QUEUE_PREFIX`
- `DB_POOL_MAX` and `DB_POOL_MIN`

Required encrypted deployment secrets:

- `DATABASE_URL`
- `REDIS_URL`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- `REPLIT_SYNC_SECRET`

Conditional API secrets:

- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` only for signed lifecycle
  webhook handling
- `SENTRY_DSN` only when error monitoring is enabled

Do not give the API `SESSION_SECRET`, worker identity, Cloudinary, caption/AI,
or other worker media-provider credentials. Use separate least-privilege API
PostgreSQL, Redis, and object-store credentials. Replit Deployment Secrets are
configured separately from workspace development secrets.

## Manual account-level actions before publish

1. Create or import a dedicated Replit project for the Core API at the exact
   approved revision; do not reuse the worker or onboarding project.
2. In Publishing, select Autoscale and set the build/run commands above.
3. Configure Autoscale machine limits, maximum instances, region, visibility,
   and budget. Confirm the database connection formula before selecting maximum
   instances.
4. Add the required configuration and encrypted deployment secrets to this API
   deployment only. Do not copy all workspace secrets.
5. Confirm PostgreSQL, Redis, and R2 network reachability from the selected
   region; configure provider allowlists/static egress if those providers
   require it.
6. Select `DATABASE_SSL_MODE`; provide a trusted CA chain where
   `verify-full` requires operator-supplied trust material.
7. Run the explicit, separately approved migration procedure against the
   intended environment before first traffic. Never add migrations to build or
   startup commands.
8. Configure custom domain/TLS, monitoring, `/health` liveness, `/readiness`
   dependency alerts, log retention, and an R2 synthetic check.
9. Rotate the historically exposed onboarding sync secret and purge it from
   repository history before any push or publication.
10. Publish only after staging validation and protected approval for the exact
    `REVISION`. Configure the separate Reserved VM worker independently.

Validate this repository contract with:

```bash
pnpm validate:core-api-autoscale
pnpm test:core-api-autoscale
```