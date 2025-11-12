-- Minimal multi-tenant schema
-- Safe to run multiple times
--
-- Schema matches Replit Option B (UUID as Primary Key):
-- - id (UUID PRIMARY KEY): Stores Replit's tenantId value
-- - The sync endpoint uses 'id' column to store Replit's 'tenantId'
-- - This is equivalent to Replit's Option B where tenantId is the primary key

create extension if not exists pgcrypto;

create table if not exists tenants(
  id uuid primary key default gen_random_uuid(),  -- Stores Replit's tenantId (UUID)
  name text not null,                              -- Also stores email (backward compat)
  active boolean default false,
  grace_until timestamptz,
  plan text default 'standard',
  created_at timestamptz default now()
);

-- Note: stripe_customer_id and stripe_subscription_id are added in migration 003
-- Indexes for these columns are also created in migration 003

create table if not exists api_keys(
  key_hash text primary key,
  tenant_id uuid references tenants(id),
  created_at timestamptz default now(),
  last_rotated_at timestamptz
);

create table if not exists usage_counters(
  tenant_id uuid primary key references tenants(id),
  period_start date not null,
  minutes_used int default 0,
  jobs int default 0,
  egress_bytes bigint default 0
);


