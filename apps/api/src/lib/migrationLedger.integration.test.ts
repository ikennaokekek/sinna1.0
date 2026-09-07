import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { Pool } from 'pg';
import { runMigrationCommand } from './migrationLedger';

const testUrl = process.env.TEST_MIGRATION_DATABASE_URL;
const confirmedDisposable = process.env.CONFIRM_DISPOSABLE_MIGRATION_DATABASE === 'YES';
const enabled = Boolean(testUrl && confirmedDisposable);
const lockId = '534218477291';
let pool: Pool;
let migrationDir: string;

async function resetFixture(): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS public.future_rollback_probe, public.future_apply_probe,
      public.sinna_core_schema_migrations, public.api_keys, public.usage_counters, public.tenants CASCADE;
    CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
    CREATE TABLE public.tenants (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      name text NOT NULL,
      active boolean DEFAULT false,
      grace_until timestamptz,
      plan text DEFAULT 'standard',
      created_at timestamptz DEFAULT now(),
      stripe_customer_id text,
      stripe_subscription_id text,
      status text DEFAULT 'inactive',
      expires_at timestamptz,
      updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
      email text,
      CONSTRAINT tenants_pkey1 PRIMARY KEY (id),
      CONSTRAINT tenants_stripe_customer_id_key UNIQUE (stripe_customer_id),
      CONSTRAINT tenants_status_check CHECK (status IN ('active', 'inactive', 'expired')),
      CONSTRAINT tenants_email_key UNIQUE (email)
    );
    CREATE TABLE public.api_keys (
      key_hash text NOT NULL CONSTRAINT api_keys_pkey PRIMARY KEY,
      tenant_id uuid,
      created_at timestamptz DEFAULT now(),
      last_rotated_at timestamptz,
      CONSTRAINT api_keys_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
    );
    CREATE TABLE public.usage_counters (
      tenant_id uuid NOT NULL CONSTRAINT usage_counters_pkey PRIMARY KEY,
      period_start date NOT NULL,
      minutes_used integer DEFAULT 0,
      jobs integer DEFAULT 0,
      egress_bytes bigint DEFAULT 0,
      CONSTRAINT usage_counters_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_tenants_active ON public.tenants(active) WHERE active = true;
    CREATE INDEX idx_tenants_plan ON public.tenants(plan);
    CREATE INDEX idx_usage_counters_period ON public.usage_counters(period_start);
    CREATE INDEX idx_usage_counters_tenant_period ON public.usage_counters(tenant_id, period_start);
    CREATE INDEX idx_api_keys_tenant_id ON public.api_keys(tenant_id);
    CREATE INDEX idx_tenants_created_at ON public.tenants(created_at);
    CREATE INDEX idx_tenants_stripe_customer ON public.tenants(stripe_customer_id);
    CREATE INDEX idx_tenants_stripe_subscription ON public.tenants(stripe_subscription_id);
    CREATE INDEX idx_tenants_status ON public.tenants(status);
    CREATE INDEX idx_tenants_expires_at ON public.tenants(expires_at);
    CREATE INDEX idx_tenants_email ON public.tenants(email);
  `);
}

describe.skipIf(!enabled)('migration ledger disposable PostgreSQL integration', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: testUrl, max: 3 });
    migrationDir = await mkdtemp(path.join(os.tmpdir(), 'sinna-migrations-'));
    const source = path.resolve(__dirname, '..', '..', 'migrations');
    for (let version = 1; version <= 8; version++) {
      const prefix = String(version).padStart(3, '0');
      const filename = (await import('fs/promises')).readdir(source).then((files) => files.find((file) => file.startsWith(`${prefix}_`)));
      const resolved = await filename;
      if (!resolved) throw new Error(`Missing historical migration ${prefix}`);
      await writeFile(path.join(migrationDir, resolved), await readFile(path.join(source, resolved)));
    }
    await resetFixture();
  });

  afterAll(async () => {
    if (pool) {
      await pool.query('DROP TABLE IF EXISTS public.future_rollback_probe, public.future_apply_probe, public.sinna_core_schema_migrations, public.api_keys, public.usage_counters, public.tenants CASCADE');
      await pool.end();
    }
    if (migrationDir) await rm(migrationDir, { recursive: true, force: true });
  });

  it('baselines, applies only future SQL, rejects drift/lock contention, and rolls back failures', async () => {
    const beforeFk = await pool.query(`SELECT oid FROM pg_constraint WHERE conname = 'api_keys_tenant_id_fkey'`);
    const baseline = await runMigrationCommand('baseline', {
      connectionString: testUrl,
      migrationsDirectory: migrationDir,
      baselineConfirmed: true,
    });
    expect(baseline.recorded).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const afterFk = await pool.query(`SELECT oid FROM pg_constraint WHERE conname = 'api_keys_tenant_id_fkey'`);
    expect(afterFk.rows[0].oid).toBe(beforeFk.rows[0].oid);

    const migration009 = 'CREATE TABLE public.future_apply_probe (id integer PRIMARY KEY);';
    await writeFile(path.join(migrationDir, '009_future_apply_probe.sql'), migration009);
    await runMigrationCommand('apply', { connectionString: testUrl, migrationsDirectory: migrationDir });
    expect((await pool.query(`SELECT to_regclass('public.future_apply_probe') AS relation`)).rows[0].relation).not.toBeNull();
    expect((await pool.query(`SELECT disposition FROM public.sinna_core_schema_migrations WHERE version = 9`)).rows[0].disposition).toBe('executed');

    await writeFile(path.join(migrationDir, '009_future_apply_probe.sql'), `${migration009}\n-- drift`);
    await expect(runMigrationCommand('status', { connectionString: testUrl, migrationsDirectory: migrationDir }))
      .rejects.toThrow(/checksum drift/);
    await writeFile(path.join(migrationDir, '009_future_apply_probe.sql'), migration009);

    const lockClient = await pool.connect();
    try {
      await lockClient.query('SELECT pg_advisory_lock($1::bigint)', [lockId]);
      await expect(runMigrationCommand('status', { connectionString: testUrl, migrationsDirectory: migrationDir }))
        .rejects.toThrow(/holds the migration ledger lock/);
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock($1::bigint)', [lockId]);
      lockClient.release();
    }

    await writeFile(
      path.join(migrationDir, '010_future_rollback_probe.sql'),
      'CREATE TABLE public.future_rollback_probe (id integer); SELECT sinna_missing_function();',
    );
    await expect(runMigrationCommand('apply', { connectionString: testUrl, migrationsDirectory: migrationDir }))
      .rejects.toThrow();
    expect((await pool.query(`SELECT to_regclass('public.future_rollback_probe') AS relation`)).rows[0].relation).toBeNull();
    expect((await pool.query('SELECT count(*)::int AS count FROM public.sinna_core_schema_migrations WHERE version = 10')).rows[0].count).toBe(0);
  });
});