-- Add updated_at column to tenants table
-- This column is used by the sync endpoint to track when tenants are updated

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Update existing rows to have updated_at = created_at if created_at exists
UPDATE tenants 
SET updated_at = created_at 
WHERE updated_at IS NULL AND created_at IS NOT NULL;

-- Set default for future inserts
ALTER TABLE tenants ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

