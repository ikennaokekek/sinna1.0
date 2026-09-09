CREATE TABLE IF NOT EXISTS public.stripe_webhook_requeue_operations (
  operation_token UUID PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES public.stripe_webhook_events(event_id) ON DELETE RESTRICT,
  committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_requeue_operations_event
  ON public.stripe_webhook_requeue_operations(event_id, committed_at DESC);