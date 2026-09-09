# SINNA CI/CD environments and promotion

## Separation of environments

Development runs locally with local, non-production resources. Staging is a
separate deployed environment used for staging validation only. Production is a
separate protected environment with separate credentials, databases, caches,
storage, and provider resources. Do not reuse credentials or resources across
these environments.

The canonical CI workflow is `.github/workflows/ci.yaml`. It builds and runs
unit tests plus disposable local PostgreSQL/Redis integration and Playwright
tests. A successful `main` CI run **does not deploy**. It only makes that exact
revision eligible for staging and for manual production promotion.

## Staging E2E

The remote staging job is opt-in and runs only for a `main` push or manual
workflow dispatch when repository variable `ENABLE_STAGING_E2E` is exactly
`true`. It is bound to the GitHub `staging` environment and uses only:

- `STAGING_E2E_BASE_URL` (staging environment secret)
- `STAGING_E2E_API_KEY` (staging environment secret)
- `STAGING_ALLOWED_HOST` (staging hostname configuration)

The target validator requires HTTPS, the exact allowed hostname, and rejects
credentials, fragments, localhost, IP addresses, and known production hosts.
Staging E2E must never target production.

Manual dispatches are accepted only from the `main` workflow ref. Configure the
GitHub `staging` environment deployment branch policy to allow only `main` as an
account-level backstop against branch-modified workflow code receiving secrets.

## Promotion flow

1. Select a green, full 40-character commit SHA from `main`.
2. Validate that revision in staging with staging-only credentials and resources.
3. Use the manually dispatched **Production promotion gate** workflow with that
   SHA and the exact required confirmation text.
4. GitHub's protected `production` environment supplies the required approval
   and account-level protection. The workflow checks out the exact SHA, performs
   a frozen install, build, and unit tests, and records evidence in the summary.
5. The gate performs no deployment and no migrations. An authorized operator
   performs any subsequent production deployment deliberately by exact revision.

Configure the GitHub `production` environment with required reviewers and a
deployment branch policy that allows only `main`. The workflow also rejects
manual dispatches whose workflow ref is not `main`.

Migrations are explicit, separately approved operations; application startup
never runs migrations. Roll back by selecting and deploying a known-good exact
revision, with a separately assessed database recovery plan where applicable.

## Render configuration

Checked-in `render.yaml` sets `autoDeploy: false` for every declared Render
service (API, workers, and cron). This repository setting does not mutate
existing live Render services. Operators must also manually disable auto-deploy
for every live Render service in the dashboard and retain manual, exact-revision
deployment control.