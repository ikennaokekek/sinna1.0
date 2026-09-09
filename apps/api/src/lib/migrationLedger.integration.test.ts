import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { Pool } from 'pg';
import { runMigrationCommand } from './migrationLedger';
import { lockTenantIdentityMutation } from './tenantIdentity';

const testUrl = process.env.TEST_MIGRATION_DATABASE_URL;
const confirmedDisposable = process.env.CONFIRM_DISPOSABLE_MIGRATION_DATABASE === 'YES';
const enabled = Boolean(testUrl && confirmedDisposable);
const lockId = '534218477291';
let pool: Pool;
let migrationDir: string;

async function resetFixture(): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS public.bootstrap_refusal_probe, public.future_rollback_probe, public.future_apply_probe,
      public.sinna_core_schema_migrations, public.stripe_webhook_events, public.worker_job_completions,
      public.api_keys, public.usage_counters, public.tenants CASCADE;
  `);
}

describe.skipIf(!enabled)('migration ledger disposable PostgreSQL integration', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: testUrl, max: 3 });
    migrationDir = await mkdtemp(path.join(os.tmpdir(), 'sinna-migrations-'));
    const source = path.resolve(__dirname, '..', '..', 'migrations');
    for (let version = 1; version <= 13; version++) {
      const prefix = String(version).padStart(3, '0');
      const filename = (await import('fs/promises')).readdir(source).then((files) => files.find((file) => file.startsWith(`${prefix}_`)));
      const resolved = await filename;
      if (!resolved) throw new Error(`Missing historical migration ${prefix}`);
      await writeFile(path.join(migrationDir, resolved), await readFile(path.join(source, resolved)));
    }
    await resetFixture();
  });

  afterAll(async () => {
    try {
      if (pool) await resetFixture();
    } finally {
      if (pool) await pool.end();
      if (migrationDir) await rm(migrationDir, { recursive: true, force: true });
    }
  });

  it('bootstraps an empty database, applies future SQL, rejects drift/lock contention, and rolls back failures', async () => {
    const bootstrap = await runMigrationCommand('bootstrap', {
      connectionString: testUrl,
      migrationsDirectory: migrationDir,
    });
    expect(bootstrap.recorded).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect((await pool.query(`SELECT conname FROM pg_constraint WHERE conname = 'tenants_pkey1'`)).rowCount).toBe(1);
    const migration011 = (await import('fs/promises')).readFile(
      path.resolve(__dirname, '..', '..', 'migrations', '011_harden_stripe_webhook_inbox.sql'),
      'utf8',
    );
    await writeFile(path.join(migrationDir, '011_harden_stripe_webhook_inbox.sql'), await migration011);
    const migration012 = (await import('fs/promises')).readFile(
      path.resolve(__dirname, '..', '..', 'migrations', '012_add_stripe_webhook_retry_backoff.sql'),
      'utf8',
    );
    await writeFile(path.join(migrationDir, '012_add_stripe_webhook_retry_backoff.sql'), await migration012);
    const migration013 = (await import('fs/promises')).readFile(
      path.resolve(__dirname, '..', '..', 'migrations', '013_add_stripe_webhook_requeue_operations.sql'),
      'utf8',
    );
    await writeFile(path.join(migrationDir, '013_add_stripe_webhook_requeue_operations.sql'), await migration013);

    await writeFile(path.join(migrationDir, '011_harden_stripe_webhook_inbox.sql'), `${await migration011}\n-- drift`);
    await expect(runMigrationCommand('apply', {
      connectionString: testUrl,
      migrationsDirectory: migrationDir,
    })).rejects.toThrow(/checksum drift: 011_harden_stripe_webhook_inbox.sql/);
    await writeFile(path.join(migrationDir, '011_harden_stripe_webhook_inbox.sql'), await migration011);
    await writeFile(path.join(migrationDir, '012_add_stripe_webhook_retry_backoff.sql'), `${await migration012}\n-- drift`);
    await expect(runMigrationCommand('apply', {
      connectionString: testUrl,
      migrationsDirectory: migrationDir,
    })).rejects.toThrow(/checksum drift: 012_add_stripe_webhook_retry_backoff.sql/);
    await writeFile(path.join(migrationDir, '012_add_stripe_webhook_retry_backoff.sql'), await migration012);
    await writeFile(path.join(migrationDir, '013_add_stripe_webhook_requeue_operations.sql'), `${await migration013}\n-- drift`);
    await expect(runMigrationCommand('apply', {
      connectionString: testUrl,
      migrationsDirectory: migrationDir,
    })).rejects.toThrow(/checksum drift: 013_add_stripe_webhook_requeue_operations.sql/);
    await writeFile(path.join(migrationDir, '013_add_stripe_webhook_requeue_operations.sql'), await migration013);

    await pool.query(`
      INSERT INTO public.tenants (name, email, plan, stripe_subscription_id)
      VALUES ('duplicate-a', 'duplicate-a@example.invalid', 'pro', 'sub_duplicate_preflight')
    `);
    const concurrentWriter = await pool.connect();
    let writerOpen = false;
    try {
      await concurrentWriter.query('BEGIN');
      writerOpen = true;
      await concurrentWriter.query(`
        INSERT INTO public.tenants (name, email, plan, stripe_subscription_id)
        VALUES ('duplicate-b', 'duplicate-b@example.invalid', 'pro', 'sub_duplicate_preflight')
      `);
      const blockedApply = runMigrationCommand('apply', {
        connectionString: testUrl,
        migrationsDirectory: migrationDir,
      });
      let applySettled = false;
      void blockedApply.then(
        () => { applySettled = true; },
        () => { applySettled = true; },
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(applySettled).toBe(false);
      await concurrentWriter.query('COMMIT');
      writerOpen = false;
      await expect(blockedApply).rejects.toThrow(/Migration 011 preflight failed: 1 duplicate non-null/);
    } catch (error) {
      if (writerOpen) await concurrentWriter.query('ROLLBACK');
      throw error;
    } finally {
      concurrentWriter.release();
    }
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM public.sinna_core_schema_migrations WHERE version = 11`,
    )).rows[0].count).toBe(0);
    await pool.query(`DELETE FROM public.tenants WHERE stripe_subscription_id = 'sub_duplicate_preflight'`);
    await runMigrationCommand('apply', { connectionString: testUrl, migrationsDirectory: migrationDir });
    expect((await pool.query(
      `SELECT disposition FROM public.sinna_core_schema_migrations WHERE version = 11`,
    )).rows[0].disposition).toBe('executed');
    expect((await pool.query(
      `SELECT disposition FROM public.sinna_core_schema_migrations WHERE version = 12`,
    )).rows[0].disposition).toBe('executed');
    expect((await pool.query(
      `SELECT disposition FROM public.sinna_core_schema_migrations WHERE version = 13`,
    )).rows[0].disposition).toBe('executed');

    const migration014 = 'CREATE TABLE public.future_apply_probe (id integer PRIMARY KEY);';
    await writeFile(path.join(migrationDir, '014_future_apply_probe.sql'), migration014);
    await runMigrationCommand('apply', { connectionString: testUrl, migrationsDirectory: migrationDir });
    expect((await pool.query(`SELECT to_regclass('public.future_apply_probe') AS relation`)).rows[0].relation).not.toBeNull();
    expect((await pool.query(`SELECT disposition FROM public.sinna_core_schema_migrations WHERE version = 9`)).rows[0].disposition).toBe('executed');
    expect((await pool.query(`SELECT disposition FROM public.sinna_core_schema_migrations WHERE version = 14`)).rows[0].disposition).toBe('executed');

    await writeFile(path.join(migrationDir, '014_future_apply_probe.sql'), `${migration014}\n-- drift`);
    await expect(runMigrationCommand('status', { connectionString: testUrl, migrationsDirectory: migrationDir }))
      .rejects.toThrow(/checksum drift/);
    await writeFile(path.join(migrationDir, '014_future_apply_probe.sql'), migration014);

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
      path.join(migrationDir, '015_future_rollback_probe.sql'),
      'CREATE TABLE public.future_rollback_probe (id integer); SELECT sinna_missing_function();',
    );
    await expect(runMigrationCommand('apply', { connectionString: testUrl, migrationsDirectory: migrationDir }))
      .rejects.toThrow();
    expect((await pool.query(`SELECT to_regclass('public.future_rollback_probe') AS relation`)).rows[0].relation).toBeNull();
    expect((await pool.query('SELECT count(*)::int AS count FROM public.sinna_core_schema_migrations WHERE version = 15')).rows[0].count).toBe(0);
    await rm(path.join(migrationDir, '015_future_rollback_probe.sql'));

    const identityLockHolder = await pool.connect();
    const identityLockContender = await pool.connect();
    try {
      await identityLockHolder.query('BEGIN');
      await lockTenantIdentityMutation(identityLockHolder);
      await identityLockContender.query('BEGIN');
      await identityLockContender.query(`SET LOCAL lock_timeout = '100ms'`);
      await expect(lockTenantIdentityMutation(identityLockContender))
        .rejects.toMatchObject({ code: '55P03' });
    } finally {
      await identityLockHolder.query('ROLLBACK');
      await identityLockContender.query('ROLLBACK');
      identityLockHolder.release();
      identityLockContender.release();
    }
  });

  it('refuses bootstrap when the disposable schema is not empty', async () => {
    await resetFixture();
    await rm(path.join(migrationDir, '014_future_apply_probe.sql'), { force: true });
    await pool.query('CREATE TABLE public.bootstrap_refusal_probe (id integer)');
    await expect(runMigrationCommand('bootstrap', {
      connectionString: testUrl,
      migrationsDirectory: migrationDir,
    })).rejects.toThrow(/empty database/);
    expect((await pool.query(`SELECT to_regclass('public.sinna_core_schema_migrations') AS relation`)).rows[0].relation).toBeNull();
    await pool.query('DROP TABLE public.bootstrap_refusal_probe');
  });
});