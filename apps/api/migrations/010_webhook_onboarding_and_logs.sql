-- Strict idempotency and observability for Stripe webhook (Render-only architecture)
-- No Replit→Render sync; Render calls Replit /internal/onboard only.
-- Safe to run multiple times.

-- Add onboarding_status to webhook_events (for checkout.session.completed lifecycle)
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS onboarding_status TEXT;
-- Backfill: treat existing rows as completed
UPDATE webhook_events SET onboarding_status = 'completed' WHERE onboarding_status IS NULL;

-- Normalize column name: spec uses 'error', we have error_message; add error if not exists for consistency
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS error TEXT;
UPDATE webhook_events SET error = error_message WHERE error IS NULL AND error_message IS NOT NULL;

-- Index for onboarding status queries
CREATE INDEX IF NOT EXISTS idx_webhook_events_onboarding_status ON webhook_events(onboarding_status);

-- Observability: log every step of Render→Replit onboarding call
CREATE TABLE IF NOT EXISTS onboarding_logs (
  id BIGSERIAL PRIMARY KEY,
  stripe_event_id TEXT NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_logs_stripe_event_id ON onboarding_logs(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_logs_created_at ON onboarding_logs(created_at);

COMMENT ON TABLE onboarding_logs IS 'Observability for Render→Replit /internal/onboard calls; no silent failures';
