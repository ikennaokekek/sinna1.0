# Manual checks before production

Use this after CI is green on your branch and before you treat a deployment as production-ready.

## 1. One-command local integration (Docker)

With **Docker Desktop** running:

```bash
pnpm test:integration:local
```

This starts Postgres 15 + Redis 7 containers, migrates, seeds the same CI API key as GitHub Actions (`sinna-ci-test-api-key`), runs the API, then `pnpm test:integration` and Playwright `pnpm test:e2e`. Use `RUN_E2E=0` to skip Playwright.

## 2. Local API + automated smoke (your own `.env`)

1. Copy `env.example` to `.env` and fill real values (database, Redis, R2, AI keys, Stripe, etc.).
2. Run migrations: `pnpm -C apps/api run migrate` (with `DATABASE_URL` set).
3. Start the API: `pnpm dev` (or `pnpm build && pnpm start`).
4. In another terminal, with the API running:

   ```bash
   export E2E_BASE_URL=http://127.0.0.1:4000
   export API_BASE_URL=http://127.0.0.1:4000
   export TEST_API_KEY=<your real tenant API key>
   pnpm test:integration
   export API_KEY="$TEST_API_KEY"
   pnpm test:e2e
   ```

   `test:integration` talks to the running server over HTTP. `test:e2e` runs Playwright against `/health` with a key.

## 3. Staging / production URL (optional GitHub job)

To run the same tests against a deployed URL on every workflow run:

1. Repository **Settings → Secrets and variables → Actions**: add `STAGING_E2E_BASE_URL` (no trailing slash) and `TEST_API_KEY` (valid on that deployment).
2. **Settings → Secrets and variables → Actions → Variables**: add `ENABLE_REMOTE_E2E` = `true`.

The `integration-e2e-remote` job will fail if the variable is set but secrets are missing.

## 4. What CI runs

- **build**: `pnpm install --frozen-lockfile` and `pnpm build`.
- **integration-e2e-local**: Postgres and Redis service containers, migrations, seeded CI tenant, API process, `pnpm test:integration`, Playwright `pnpm test:e2e`, then `pnpm -C apps/api test` with the same database.

## 5. Production checklist (operations)

- Environment variables set on the host (Render, etc.) and match `env.example` shape.
- Database migrated; at least one active tenant and API key.
- Redis reachable from API and worker if you use queues.
- Stripe webhooks point to the live API URL; use live keys only in production.
- CORS and `BASE_URL` / public URLs match your real domain.
