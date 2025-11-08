-- Performance optimization: Add indexes for common queries

-- Index for looking up tenants by active status (common in queries)
create index if not exists idx_tenants_active on tenants(active) where active = true;

-- Index for looking up tenants by plan (for usage tracking)
create index if not exists idx_tenants_plan on tenants(plan);

-- Index for usage_counters lookups by period
create index if not exists idx_usage_counters_period on usage_counters(period_start);

-- Composite index for tenant usage lookups
create index if not exists idx_usage_counters_tenant_period on usage_counters(tenant_id, period_start);

-- Index for API key lookups (if not already exists)
create index if not exists idx_api_keys_tenant_id on api_keys(tenant_id);

-- Index for tenant creation date (for analytics)
create index if not exists idx_tenants_created_at on tenants(created_at);

