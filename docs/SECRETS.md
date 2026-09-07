# SINNA Core secrets handling

Use `docs/ENVIRONMENT_VARIABLES.md` as the complete rebuild manifest, including
non-secret runtime, migration, test, smoke, and operational variables. This file
identifies which entries need secret storage and the security boundaries they
protect. All values in `env.example` are placeholders.

## Store as secrets

| Secret group | Variables |
| --- | --- |
| Data and media | `DATABASE_URL`, `REDIS_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CLOUDINARY_URL` |
| AI providers | `ASSEMBLYAI_API_KEY`, `OPENAI_API_KEY`, `OPEN_ROUTER_QWEN_KEY` |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY_LIVE`, `STRIPE_WEBHOOK_SECRET_LIVE`, `STRIPE_LIVE_SECRET_KEY` |
| Core service authentication | `REPLIT_SYNC_SECRET`, `ADMIN_API_KEY`, `SEED_API_KEY_SECRET` |
| Email and observability | `RESEND_API_KEY`, `SENDGRID_API_KEY`, `SENTRY_DSN` |
| Test/operations | `API_KEY`, `TEST_API_KEY`, `TEST_MIGRATION_DATABASE_URL`, `RENDER_API_KEY`, `SLACK_WEBHOOK_URL` |

Treat `R2_ACCOUNT_ID`, price IDs, bucket names, endpoint URLs, email addresses,
and host service IDs as configuration rather than credentials, unless your
organization classifies them more restrictively.

## Hardened integration rules

- `/v1/sync/tenant` requires `REPLIT_SYNC_SECRET` in `x-sync-secret`; network
  origin or an IP list does not authenticate the caller.
- Payment webhooks require the provider signature, raw body, configured client,
  and webhook secret. The only bypass is `NODE_ENV=test` together with
  `STRIPE_TESTING=true`.
- A completed checkout is acknowledged only. Core does not provision tenants or
  issue API keys from that event; onboarding performs provisioning and syncs
  Core with the shared sync secret.
- Database migrations are explicit operations. Startup does not migrate.

## Operating practice

1. Put secrets in a provider-neutral encrypted secret store or local untracked
   `.env` file; inject them only into the process that needs them.
2. Use separate credentials for development, test, staging, and production.
3. Rotate a credential immediately after suspected exposure and update both
   sides of shared-secret integrations in a coordinated change.
4. For the migration integration test, use a disposable database and set
   `CONFIRM_DISPOSABLE_MIGRATION_DATABASE=YES`; the test intentionally modifies
   its database.
5. Never paste real credentials into documentation, examples, source control,
   logs, or support tickets.