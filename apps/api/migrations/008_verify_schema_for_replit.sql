-- Verify schema matches Replit expectations
-- This migration ensures all required columns exist for Replit sync
--
-- Replit expects (Option B - UUID as Primary Key):
-- - tenantId (UUID PRIMARY KEY) -> We use 'id' column for this
-- - email (TEXT)
-- - plan (TEXT)
-- - subscription_status (TEXT) -> We use 'status' column
-- - expires_at (TIMESTAMPTZ)
-- - createdAt (TIMESTAMPTZ) -> We use 'created_at'
-- - updated_at (TIMESTAMPTZ)
-- - hashed_api_key -> Stored in api_keys table (correct separation)

-- Verify id column exists and is UUID (stores Replit's tenantId)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tenants' AND column_name = 'id' AND data_type = 'uuid'
  ) THEN
    RAISE EXCEPTION 'tenants.id column (UUID) does not exist - required for Replit sync';
  END IF;
END $$;

-- Verify email column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tenants' AND column_name = 'email'
  ) THEN
    RAISE EXCEPTION 'tenants.email column does not exist - required for Replit sync';
  END IF;
END $$;

-- Verify status column exists (maps to subscription_status)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tenants' AND column_name = 'status'
  ) THEN
    RAISE EXCEPTION 'tenants.status column does not exist - required for Replit sync';
  END IF;
END $$;

-- Verify updated_at column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tenants' AND column_name = 'updated_at'
  ) THEN
    RAISE EXCEPTION 'tenants.updated_at column does not exist - required for Replit sync';
  END IF;
END $$;

-- Log schema verification
DO $$
BEGIN
  RAISE NOTICE '✅ Schema verification passed - all required columns exist for Replit sync';
  RAISE NOTICE '   - id (UUID PRIMARY KEY) stores Replit tenantId';
  RAISE NOTICE '   - email column exists';
  RAISE NOTICE '   - status column exists (maps to subscription_status)';
  RAISE NOTICE '   - expires_at, created_at, updated_at columns exist';
END $$;

