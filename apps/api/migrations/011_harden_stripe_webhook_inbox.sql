ALTER TABLE public.stripe_webhook_events
  DROP CONSTRAINT stripe_webhook_events_status_check;

ALTER TABLE public.stripe_webhook_events
  ALTER COLUMN claim_token DROP NOT NULL,
  ADD COLUMN event_type text NOT NULL DEFAULT 'legacy',
  ADD COLUMN event_created bigint NOT NULL DEFAULT 0,
  ADD COLUMN livemode boolean NOT NULL DEFAULT false,
  ADD COLUMN payload_sha256 text NOT NULL DEFAULT repeat('0', 64),
  ADD COLUMN attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN last_error text,
  ADD COLUMN outcome text,
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT stripe_webhook_events_status_check
    CHECK (status IN ('processing', 'completed', 'failed', 'dead_letter', 'ignored')),
  ADD CONSTRAINT stripe_webhook_events_attempts_check
    CHECK (attempts >= 0 AND attempts <= 5),
  ADD CONSTRAINT stripe_webhook_events_payload_sha256_check
    CHECK (payload_sha256 ~ '^[0-9a-f]{64}$');

CREATE INDEX idx_stripe_webhook_events_recovery
  ON public.stripe_webhook_events (status, updated_at)
  WHERE status IN ('failed', 'dead_letter');

CREATE UNIQUE INDEX tenants_stripe_subscription_id_unique
  ON public.tenants (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;