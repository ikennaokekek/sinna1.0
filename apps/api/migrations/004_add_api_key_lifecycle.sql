-- Add API key lifecycle fields to tenants table
-- Safe to run multiple times

-- Add status field (active, inactive, expired)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'expired'));

-- Add expires_at field for subscription expiration
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Add index on status for faster queries
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- Add index on expires_at for expiration checks
CREATE INDEX IF NOT EXISTS idx_tenants_expires_at ON tenants(expires_at);

-- Update existing active tenants to have status = 'active'
UPDATE tenants SET status = 'active' WHERE active = true AND status IS NULL;

-- Set expires_at for existing active tenants (30 days from now if not set)
UPDATE tenants 
SET expires_at = NOW() + INTERVAL '30 days' 
WHERE active = true AND expires_at IS NULL;

