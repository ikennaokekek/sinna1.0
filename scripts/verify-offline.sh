#!/usr/bin/env bash
# Build and unit-test without inheriting provider or deployment credentials.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export NODE_ENV=test
# Non-routable local endpoints prevent dotenv from replacing these with values
# from a developer's .env while retaining the URL shape expected by test setup.
export DATABASE_URL=postgresql://127.0.0.1:1/sinna_offline
export REDIS_URL=redis://127.0.0.1:1
export STRIPE_SECRET_KEY=
export STRIPE_WEBHOOK_SECRET=
export R2_ACCOUNT_ID=
export R2_ACCESS_KEY_ID=
export R2_SECRET_ACCESS_KEY=
export R2_BUCKET=
export CLOUDINARY_URL=
export ASSEMBLYAI_API_KEY=
export OPENAI_API_KEY=
export SENTRY_DSN=
export RESEND_API_KEY=
export SENDGRID_API_KEY=
export NOTIFY_FROM_EMAIL=

pnpm install --frozen-lockfile
pnpm build
pnpm test:unit