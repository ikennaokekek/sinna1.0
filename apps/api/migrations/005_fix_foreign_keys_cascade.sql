-- Fix foreign key constraints to include ON DELETE CASCADE
-- This ensures proper cleanup when tenants are deleted

-- Drop existing foreign key constraints if they exist
ALTER TABLE api_keys 
  DROP CONSTRAINT IF EXISTS api_keys_tenant_id_fkey;

ALTER TABLE usage_counters 
  DROP CONSTRAINT IF EXISTS usage_counters_tenant_id_fkey;

-- Recreate with ON DELETE CASCADE
ALTER TABLE api_keys 
  ADD CONSTRAINT api_keys_tenant_id_fkey 
  FOREIGN KEY (tenant_id) 
  REFERENCES tenants(id) 
  ON DELETE CASCADE;

ALTER TABLE usage_counters 
  ADD CONSTRAINT usage_counters_tenant_id_fkey 
  FOREIGN KEY (tenant_id) 
  REFERENCES tenants(id) 
  ON DELETE CASCADE;

