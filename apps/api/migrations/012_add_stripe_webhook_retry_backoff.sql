ALTER TABLE public.stripe_webhook_events
  ADD COLUMN next_attempt_at timestamptz;

UPDATE public.stripe_webhook_events
   SET next_attempt_at = NOW()
 WHERE status = 'failed';

DROP INDEX public.idx_stripe_webhook_events_recovery;

CREATE INDEX idx_stripe_webhook_events_recovery
  ON public.stripe_webhook_events (status, next_attempt_at, updated_at)
  WHERE status IN ('failed', 'dead_letter');