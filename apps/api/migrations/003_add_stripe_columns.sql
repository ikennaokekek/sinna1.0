-- Add Stripe customer and subscription columns if they don't exist
-- Safe to run multiple times

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Add unique constraint if column exists and constraint doesn't
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'tenants_stripe_customer_id_key'
  ) THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_stripe_customer_id_key UNIQUE (stripe_customer_id);
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_tenants_stripe_customer ON tenants(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_tenants_stripe_subscription ON tenants(stripe_subscription_id);

