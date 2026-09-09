# Manual checks before production

Use this after CI is green and before requesting protected production approval.
Canonical policy is in `docs/CI_CD_ENVIRONMENTS.md`.

## 1. Local validation

With Docker available, run:

```bash
pnpm test:integration:local
```

This is disposable local validation with PostgreSQL and Redis; it is not
staging or production. Migrations used there are explicit commands. Application
startup must never migrate.

## 2. Staging validation

Staging has its own deployment, credentials, data stores, and provider
resources. Configure the protected GitHub `staging` environment with
`STAGING_E2E_BASE_URL` and `STAGING_E2E_API_KEY`, and configure the exact
`STAGING_ALLOWED_HOST`. Enable the staging job only with
`ENABLE_STAGING_E2E=true`.

The workflow rejects non-HTTPS URLs, credentials/fragments, localhost/IP
addresses, known production hosts, and host mismatches. Staging E2E never
targets production.

## 3. Production approval and deploy

1. Select the green full commit SHA validated in staging.
2. Dispatch the protected production-promotion workflow with that SHA and its
   exact confirmation text. Production approval and account-level protection
   must be configured in GitHub before use.
3. The workflow is an approval/traceability gate only: it builds and unit-tests
   the exact revision but performs no deployment and no migrations.
4. An authorized operator deploys the approved exact revision manually.

`render.yaml` disables API and worker auto-deploy, but repository configuration
does not mutate live Render settings. Disable Auto-Deploy in the live Render
dashboard manually as well.

## 4. Migration and rollback controls

Production migrations require a separate explicit approval, backup, execution,
and verification plan. Never rely on startup migrations. Roll back by manually
deploying a known-good exact revision; evaluate database compatibility and
restore separately.