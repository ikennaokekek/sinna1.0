-- Add email column to tenants table
-- Replit expects an explicit 'email' column, not just 'name'
-- This migration adds email column and backfills from name for existing tenants

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email TEXT;

-- Backfill email from name for existing tenants (name was used to store email)
UPDATE tenants 
SET email = name 
WHERE email IS NULL AND name IS NOT NULL;

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_tenants_email ON tenants(email);

-- Add unique constraint on email to prevent duplicates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'tenants_email_key'
  ) THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_email_key UNIQUE (email);
  END IF;
END $$;

