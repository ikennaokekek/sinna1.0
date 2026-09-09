# Render manual deployment policy

`render.yaml` intentionally sets `autoDeploy: false` for every declared SINNA
service (API, workers, and cron). A push to `main` must not deploy any service
automatically.

Repository configuration does **not** change a live Render service. An operator
with the appropriate Render account access must manually disable Auto-Deploy in
the Render dashboard for every existing service, then verify that
the setting remains off. Do not use repository changes or this document as
evidence that a live provider setting has changed.

## Manual deployment flow

1. Choose an exact, full commit SHA that has passed canonical CI and staging
   validation.
2. Pass the protected GitHub production promotion gate for that exact SHA.
   The gate is approval/traceability only: it performs no deployment and no
   migrations.
3. An authorized operator deploys that exact revision manually in Render,
   following the protected production change process.
4. Run migrations only as an explicit, separately approved operation. Startup
   migrations are prohibited.
5. Verify health, service behavior, and monitoring with production-only
   credentials. Never use staging E2E credentials or targets for production.

## Rollback

Roll back by manually deploying a known-good exact revision. Assess database
compatibility and restore procedures separately; do not assume application
rollback reverses an explicit migration.