import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { Pool } from 'pg';
import {
  apply,
  assertApprovedHistoricalMigrations,
  baseline,
  bootstrap,
  discoverMigrations,
  runMigrationCommand,
  verifyHistoricalSchemaFingerprint,
  validateLedgerRecords,
} from './migrationLedger';

vi.mock('pg', () => ({ Pool: vi.fn() }));

const historicalRows = (migrations: Awaited<ReturnType<typeof discoverMigrations>>) =>
  migrations.slice(0, 8).map(({ version, filename, checksum }) => ({ version, filename, checksum, disposition: 'baselined' }));
const appliedCurrentMigrations = (migrations: Awaited<ReturnType<typeof discoverMigrations>>) => [
  ...historicalRows(migrations),
  ...migrations.slice(8).map((migration) => ({ ...migration, disposition: 'executed' as const })),
];

describe('migration ledger', () => {
  it('discovers the approved numeric migration sequence in order', async () => {
    const migrations = await discoverMigrations();
    expect(migrations.map((migration) => migration.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(migrations[0].checksum).toHaveLength(64);
  });

  it.each([
    [1, '001_init.sql'],
    [11, '011_harden_stripe_webhook_inbox.sql'],
    [12, '012_add_stripe_webhook_retry_backoff.sql'],
    [13, '013_add_stripe_webhook_requeue_operations.sql'],
  ])('rejects checksum drift in pinned migration %i', async (version, filename) => {
    const migrations = await discoverMigrations();
    migrations[version - 1] = { ...migrations[version - 1], checksum: '0'.repeat(64) };
    expect(() => assertApprovedHistoricalMigrations(migrations)).toThrow(
      new RegExp(`checksum drift: ${filename}`),
    );
  });

  it('rejects a ledger that does not begin at version 1', async () => {
    const migrations = await discoverMigrations();
    expect(() => validateLedgerRecords(historicalRows(migrations).slice(1), migrations))
      .toThrow(/gap before version 2/);
  });

  it('rejects an invalid historical disposition', async () => {
    const migrations = await discoverMigrations();
    const rows = historicalRows(migrations);
    rows[0] = { ...rows[0], disposition: 'executed' as const };
    expect(() => validateLedgerRecords(rows, migrations, true)).toThrow(/disposition/);
  });

  it('baselines only ledger records and never executes historical SQL', async () => {
    const migrations = await discoverMigrations();
    let inserted = 0;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('to_regclass')) return { rows: [{ ledger: null }] };
      if (sql.includes('SELECT version')) return { rows: inserted === 8 ? historicalRows(migrations) : [] };
      if (sql.includes('WITH expected_columns')) return { rows: [{ matches: true }] };
      if (sql.includes('INSERT INTO public.sinna_core_schema_migrations')) inserted++;
      return { rows: [] };
    });
    await baseline({ query } as never, migrations);
    expect(query.mock.calls.some(([sql]) => sql === migrations[0].sql)).toBe(false);
    expect(query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO public.sinna_core_schema_migrations'))).toHaveLength(8);
  });

  it('bootstraps an empty database atomically with historical SQL and baselined records', async () => {
    const migrations = await discoverMigrations();
    let inserted = 0;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('to_regclass')) return { rows: [{ ledger: null }] };
      if (sql.includes('WITH public_objects')) return { rows: [{ has_public_objects: false, has_unknown_schemas: false }] };
      if (sql.includes('WITH expected_columns')) return { rows: [{ matches: true }] };
      if (sql.includes('SELECT version')) return { rows: inserted === 8 ? historicalRows(migrations) : [] };
      if (sql.includes('INSERT INTO public.sinna_core_schema_migrations')) inserted++;
      return { rows: [] };
    });
    await bootstrap({ query } as never, migrations);
    expect(query.mock.calls.map(([sql]) => sql)).toContain(migrations[0].sql);
    expect(query).toHaveBeenCalledWith('ALTER TABLE public.tenants RENAME CONSTRAINT tenants_pkey TO tenants_pkey1');
    expect(query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO public.sinna_core_schema_migrations'))).toHaveLength(8);
    expect(query).toHaveBeenCalledWith('COMMIT');
  });

  it('refuses bootstrap on a non-empty schema before executing historical SQL', async () => {
    const migrations = await discoverMigrations();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('to_regclass')) return { rows: [{ ledger: null }] };
      if (sql.includes('WITH public_objects')) return { rows: [{ has_public_objects: true, has_unknown_schemas: false }] };
      return { rows: [] };
    });
    await expect(bootstrap({ query } as never, migrations)).rejects.toThrow(/empty database/);
    expect(query.mock.calls.some(([sql]) => sql === migrations[0].sql)).toBe(false);
  });

  it('rolls back bootstrap schema and ledger changes when historical SQL fails', async () => {
    const migrations = await discoverMigrations();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('to_regclass')) return { rows: [{ ledger: null }] };
      if (sql.includes('WITH public_objects')) return { rows: [{ has_public_objects: false, has_unknown_schemas: false }] };
      if (sql === migrations[2].sql) throw new Error('historical failure');
      return { rows: [] };
    });
    await expect(bootstrap({ query } as never, migrations)).rejects.toThrow('historical failure');
    expect(query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('rejects a non-matching historical schema fingerprint', async () => {
    await expect(verifyHistoricalSchemaFingerprint({
      query: vi.fn().mockResolvedValue({ rows: [{ matches: false }] }),
    } as never)).rejects.toThrow(/fingerprint/);
  });

  it('rolls back a future migration when its SQL fails', async () => {
    const migrations = await discoverMigrations();
    const future = { version: 14, filename: '014_future.sql', checksum: 'a'.repeat(64), sql: 'SELECT fail_me()' };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('to_regclass')) return { rows: [{ ledger: 'sinna_core_schema_migrations' }] };
      if (sql.includes('SELECT version')) return { rows: appliedCurrentMigrations(migrations) };
      if (sql === future.sql) throw new Error('bad migration');
      return { rows: [] };
    });
    await expect(apply({ query } as never, [...migrations, future])).rejects.toThrow('bad migration');
    expect(query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('locks tenant identity writes before migration 011 duplicate preflight', async () => {
    const migrations = await discoverMigrations();
    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.includes('to_regclass')) return { rows: [{ ledger: 'sinna_core_schema_migrations' }] };
      if (sql.includes('SELECT version')) return { rows: historicalRows(migrations) };
      if (sql.includes('duplicate_count')) return { rows: [{ duplicate_count: 0 }] };
      return { rows: [] };
    });
    await apply({ query } as never, migrations.slice(0, 11));
    expect(calls.indexOf('LOCK TABLE public.tenants IN SHARE ROW EXCLUSIVE MODE')).toBeGreaterThan(
      calls.indexOf('BEGIN'),
    );
    expect(calls.indexOf('LOCK TABLE public.tenants IN SHARE ROW EXCLUSIVE MODE')).toBeLessThan(
      calls.findIndex((sql) => sql.includes('duplicate_count')),
    );
  });

  it('applies an unapplied future migration in a transaction', async () => {
    const migrations = await discoverMigrations();
    const future = { version: 14, filename: '014_future.sql', checksum: 'b'.repeat(64), sql: 'CREATE TABLE future_test (id int)' };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('to_regclass')) return { rows: [{ ledger: 'sinna_core_schema_migrations' }] };
      if (sql.includes('SELECT version')) return { rows: appliedCurrentMigrations(migrations) };
      return { rows: [] };
    });
    await apply({ query } as never, [...migrations, future]);
    expect(query.mock.calls.map(([sql]) => sql)).toContain(future.sql);
    expect(query).toHaveBeenCalledWith('BEGIN');
    expect(query).toHaveBeenCalledWith('COMMIT');
  });

  it('does not execute an already-recorded future migration', async () => {
    const migrations = await discoverMigrations();
    const future = { version: 14, filename: '014_future.sql', checksum: 'b'.repeat(64), sql: 'CREATE TABLE future_test (id int)' };
    const records = [...appliedCurrentMigrations(migrations), { ...future, disposition: 'executed' as const }];
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('to_regclass')) return { rows: [{ ledger: 'sinna_core_schema_migrations' }] };
      if (sql.includes('SELECT version')) return { rows: records };
      return { rows: [] };
    });
    await apply({ query } as never, [...migrations, future]);
    expect(query.mock.calls.some(([sql]) => sql === future.sql)).toBe(false);
  });

  it('rolls back if atomic ledger recording fails', async () => {
    const migrations = await discoverMigrations();
    const future = { version: 14, filename: '014_future.sql', checksum: 'c'.repeat(64), sql: 'CREATE TABLE future_test (id int)' };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('to_regclass')) return { rows: [{ ledger: 'sinna_core_schema_migrations' }] };
      if (sql.includes('SELECT version')) return { rows: appliedCurrentMigrations(migrations) };
      if (sql.includes('INSERT INTO public.sinna_core_schema_migrations')) throw new Error('ledger insert failed');
      return { rows: [] };
    });
    await expect(apply({ query } as never, [...migrations, future])).rejects.toThrow('ledger insert failed');
    expect(query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('rejects transaction-control SQL in future migrations', async () => {
    const migrations = await discoverMigrations();
    const future = { version: 14, filename: '014_future.sql', checksum: 'd'.repeat(64), sql: 'COMMIT; CREATE TABLE future_test (id int)' };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('to_regclass')) return { rows: [{ ledger: 'sinna_core_schema_migrations' }] };
      if (sql.includes('SELECT version')) return { rows: appliedCurrentMigrations(migrations) };
      return { rows: [] };
    });
    await expect(apply({ query } as never, [...migrations, future])).rejects.toThrow(/not allowed/);
  });

  it('fails cleanly when another client owns the advisory lock', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [{ locked: false }] }),
      release: vi.fn(),
    };
    const end = vi.fn().mockResolvedValue(undefined);
    vi.mocked(Pool).mockImplementation(function () {
      return { connect: vi.fn().mockResolvedValue(client), end } as never;
    });
    await expect(runMigrationCommand('status', { connectionString: 'postgres://test' }))
      .rejects.toThrow(/holds the migration ledger lock/);
    expect(client.release).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
  });

  it('keeps status read-only when the ledger is absent', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
        if (sql.includes('WITH expected_columns')) return { rows: [{ matches: true }] };
        if (sql.includes('to_regclass')) return { rows: [{ ledger: null }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    vi.mocked(Pool).mockImplementation(function () {
      return { connect: vi.fn().mockResolvedValue(client), end: vi.fn().mockResolvedValue(undefined) } as never;
    });
    await expect(runMigrationCommand('status', { connectionString: 'postgres://test' })).resolves.toMatchObject({ recorded: [] });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('CREATE TABLE'))).toBe(false);
  });

  it('makes verify fail read-only when the ledger is absent', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
        if (sql.includes('WITH expected_columns')) return { rows: [{ matches: true }] };
        if (sql.includes('to_regclass')) return { rows: [{ ledger: null }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    vi.mocked(Pool).mockImplementation(function () {
      return { connect: vi.fn().mockResolvedValue(client), end: vi.fn().mockResolvedValue(undefined) } as never;
    });
    await expect(runMigrationCommand('verify', { connectionString: 'postgres://test' })).rejects.toThrow(/absent/);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('CREATE TABLE'))).toBe(false);
  });

  it('uses immutable ledger verification after future migrations evolve the schema', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'sinna-ledger-unit-'));
    try {
      const source = path.resolve(__dirname, '..', '..', 'migrations');
      for (const filename of await readdir(source)) {
        if (filename.endsWith('.sql')) await writeFile(path.join(directory, filename), await readFile(path.join(source, filename)));
      }
      await writeFile(path.join(directory, '014_future.sql'), 'ALTER TABLE tenants ADD COLUMN future_value text');
      const migrations = await discoverMigrations(directory);
      const records = [
        ...historicalRows(migrations),
        { ...migrations[8], disposition: 'executed' as const },
        { ...migrations[9], disposition: 'executed' as const },
        { ...migrations[10], disposition: 'executed' as const },
        { ...migrations[11], disposition: 'executed' as const },
        { ...migrations[12], disposition: 'executed' as const },
        { ...migrations[13], disposition: 'executed' as const },
      ];
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
          if (sql.includes('to_regclass')) return { rows: [{ ledger: 'sinna_core_schema_migrations' }] };
          if (sql.includes('SELECT version')) return { rows: records };
          if (sql.includes('pg_advisory_unlock')) return { rows: [{ pg_advisory_unlock: true }] };
          return { rows: [] };
        }),
        release: vi.fn(),
      };
      vi.mocked(Pool).mockImplementation(function () {
        return { connect: vi.fn().mockResolvedValue(client), end: vi.fn().mockResolvedValue(undefined) } as never;
      });
      await expect(runMigrationCommand('verify', {
        connectionString: 'postgres://test',
        migrationsDirectory: directory,
      })).resolves.toMatchObject({ pending: [] });
      expect(client.query.mock.calls.some(([sql]) => String(sql).includes('WITH expected_columns'))).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('requires an explicit baseline confirmation', async () => {
    const client = {
      query: vi.fn(async (sql: string) => sql.includes('pg_try_advisory_lock') ? { rows: [{ locked: true }] } : { rows: [] }),
      release: vi.fn(),
    };
    vi.mocked(Pool).mockImplementation(function () {
      return { connect: vi.fn().mockResolvedValue(client), end: vi.fn().mockResolvedValue(undefined) } as never;
    });
    await expect(runMigrationCommand('baseline', { connectionString: 'postgres://test' })).rejects.toThrow(/--through 008/);
  });

  it('keeps the seed command separate from migrations', async () => {
    const seed = await readFile(path.resolve(__dirname, '..', 'scripts', 'seed.ts'), 'utf8');
    expect(seed).not.toMatch(/runMigrations|migrationLedger/);
  });
});