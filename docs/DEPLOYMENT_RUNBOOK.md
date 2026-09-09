# SINNA deployment runbook

This runbook is manual-only. Passing CI on `main` does not deploy. See
`docs/CI_CD_ENVIRONMENTS.md` for the canonical environment and promotion flow.

## Before a production change

1. Identify a green, full 40-character revision from `main`.
2. Confirm staging validation used only staging URL, API key, credentials, and
   resources. Staging E2E must never target production.
3. Obtain production approval through the protected GitHub `production`
   environment and the manual production-promotion gate for that exact SHA.
4. Verify production account-level access, change approval, backup status, and
   environment-specific secrets. Production credentials and resources must not
   be shared with development or staging.

## Deploy and verify

An authorized operator manually promotes the approved exact SHA to both
independently configured, dedicated Replit project/deployment contexts specified in
`infra/replit/core-deployment-units.yaml`: public Autoscale `core-api` and
private always-on Reserved VM `core-worker`. The contract is repository-only and
does not alter dashboard settings. `render.yaml` remains non-authoritative and
has `autoDeploy: false` for every listed service.

Run database migrations only as an explicit, separately approved operation with
a backup and verification plan. Application startup must never run migrations.
After deployment, check unauthenticated `/health`, bounded `/readiness`, worker
heartbeat/readiness, queue processing, monitoring, and relevant external
integrations. Do not put R2 calls in request readiness.

## Rollback

Deploy a previously verified, known-good **exact revision** manually. Evaluate
database compatibility independently: application rollback does not undo an
explicit migration. Follow the database backup/restore procedure when needed,
then verify the restored revision with production-only checks.