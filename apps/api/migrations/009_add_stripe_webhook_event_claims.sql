CREATE TABLE public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('processing', 'completed')),
  claim_token uuid NOT NULL,
  processing_started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stripe_webhook_events_processing
  ON public.stripe_webhook_events (processing_started_at)
  WHERE status = 'processing';

ALTER TABLE public.tenants
  ADD COLUMN stripe_event_created bigint,
  ADD COLUMN stripe_event_id text;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_stripe_event_order_pair_check
  CHECK (
    (stripe_event_created IS NULL AND stripe_event_id IS NULL)
    OR (stripe_event_created IS NOT NULL AND stripe_event_id IS NOT NULL)
  );