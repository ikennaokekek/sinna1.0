-- Add webhook events table for idempotency
-- Safe to run multiple times

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_status TEXT NOT NULL DEFAULT 'completed',
  error_message TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON webhook_events(processed_at);

-- Add comment for documentation
COMMENT ON TABLE webhook_events IS 'Tracks processed Stripe webhook events for idempotency';
