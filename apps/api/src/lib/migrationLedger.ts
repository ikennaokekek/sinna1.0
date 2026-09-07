import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { Pool, PoolClient } from 'pg';

export const HISTORICAL_MIGRATION_COUNT = 8;
const ADVISORY_LOCK_ID = '534218477291';

const APPROVED_HISTORICAL_HASHES: Record<string, string> = {
  '001_init.sql': '7d08b33adba265fb9a3864b2c2207dd213d767530891833681ef921c4a73160f',
  '002_add_indexes.sql': '748cbcb1061d92c1be435d08430d3d2cea33c8e0b933e4670d0c5f12d1f1c59f',
  '003_add_stripe_columns.sql': '28f92e1414d062d3759bdc9f9b1ed3f3cb94cf9b84b0451cad84f0242a0812b7',
  '004_add_api_key_lifecycle.sql': '39a834d7550e72d34b879a83c9c6c58d3ba90c106870f420e5819706af1b2ee2',
  '005_fix_foreign_keys_cascade.sql': '1f47c7baaedd00c27598fc8cc95cf483426d0606f2ee80d1a9379a871ace4faa',
  '006_add_updated_at.sql': '8d2205395a9fbb3ccc5be34a90a525b2b40345be0efd68e571fc4317c5786536',
  '007_add_email_column.sql': 'c8de3be49e342003d3bd7fa3ee29583b80cc4eca1379878d13b4c8d454db0b1f',
  '008_verify_schema_for_replit.sql': 'e380927ceff0458b7ad7b971a7269822c5230690b9d74433c42eb9c7c5914334',
};

export interface Migration {
  version: number;
  filename: string;
  checksum: string;
  sql: string;
}
export interface LedgerRecord extends Pick<Migration, 'version' | 'filename' | 'checksum'> {
  disposition: 'baselined' | 'executed';
}

const forbiddenTransactionalSql = /\b(?:BEGIN|COMMIT|ROLLBACK|VACUUM)\b|CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY/i;

export interface Queryable {
  query: PoolClient['query'];
}

const migrationFile = /^(\d{3})_([A-Za-z0-9][A-Za-z0-9._-]*)\.sql$/;

export function defaultMigrationsDirectory(): string {
  return path.resolve(__dirname, '..', '..', 'migrations');
}

/** Reads bytes, rather than text, so checksums cannot be changed by decoding. */
export async function discoverMigrations(directory = defaultMigrationsDirectory()): Promise<Migration[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.sql')).map((entry) => entry.name);
  const parsed = files.map((filename) => {
    const match = migrationFile.exec(filename);
    if (!match) throw new Error(`Invalid migration filename "${filename}"; expected NNN_description.sql`);
    return { filename, version: Number(match[1]) };
  }).sort((a, b) => a.version - b.version);

  for (let i = 0; i < parsed.length; i++) {
    if (parsed[i].version !== i + 1) {
      throw new Error(`Migration versions must be contiguous starting at 001; found ${parsed[i].filename}`);
    }
  }

  const migrations = await Promise.all(parsed.map(async ({ filename, version }) => {
    const bytes = await fs.readFile(path.join(directory, filename));
    return { version, filename, checksum: createHash('sha256').update(bytes).digest('hex'), sql: bytes.toString('utf8') };
  }));
  assertApprovedHistoricalMigrations(migrations);
  return migrations;
}

export function assertApprovedHistoricalMigrations(migrations: Migration[]): void {
  for (let version = 1; version <= HISTORICAL_MIGRATION_COUNT; version++) {
    const migration = migrations[version - 1];
    const filename = `${String(version).padStart(3, '0')}_${[
      'init', 'add_indexes', 'add_stripe_columns', 'add_api_key_lifecycle',
      'fix_foreign_keys_cascade', 'add_updated_at', 'add_email_column', 'verify_schema_for_replit',
    ][version - 1]}.sql`;
    if (!migration || migration.version !== version || migration.filename !== filename) {
      throw new Error(`Approved historical migration ${filename} is missing or renamed`);
    }
    if (migration.checksum !== APPROVED_HISTORICAL_HASHES[filename]) {
      throw new Error(`Approved historical migration checksum drift: ${filename}`);
    }
  }
}

async function createLedger(client: Queryable): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.sinna_core_schema_migrations (
      version integer PRIMARY KEY,
      filename text NOT NULL UNIQUE,
      checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
      disposition text NOT NULL CHECK (disposition IN ('baselined', 'executed')),
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function ledgerExists(client: Queryable): Promise<boolean> {
  const result = await client.query(`SELECT to_regclass('public.sinna_core_schema_migrations') AS ledger`);
  return result.rows[0]?.ledger != null;
}

async function recordedMigrations(client: Queryable): Promise<LedgerRecord[]> {
  const result = await client.query('SELECT version, filename, checksum, disposition FROM public.sinna_core_schema_migrations ORDER BY version');
  return result.rows.map((row) => ({ version: Number(row.version), filename: row.filename, checksum: row.checksum, disposition: row.disposition }));
}

export function validateLedgerRecords(records: LedgerRecord[], migrations: Migration[], requireHistorical = false): void {
  const known = new Map(migrations.map((migration) => [migration.version, migration]));
  for (let i = 0; i < records.length; i++) {
    const recorded = records[i];
    if ((i === 0 && recorded.version !== 1) || (i > 0 && records[i - 1].version + 1 !== recorded.version)) {
      throw new Error(`Migration ledger has a gap before version ${recorded.version}`);
    }
    const migration = known.get(recorded.version);
    if (!migration || migration.filename !== recorded.filename || migration.checksum !== recorded.checksum) {
      throw new Error(`Migration ledger checksum drift at version ${recorded.version}`);
    }
    if (recorded.disposition !== (recorded.version <= HISTORICAL_MIGRATION_COUNT ? 'baselined' : 'executed')) {
      throw new Error(`Migration ledger disposition is invalid at version ${recorded.version}`);
    }
  }
  if (requireHistorical && (records.length < HISTORICAL_MIGRATION_COUNT || records[HISTORICAL_MIGRATION_COUNT - 1]?.version !== HISTORICAL_MIGRATION_COUNT)) throw new Error('Migration ledger is incomplete');
}

export async function verifyLedger(client: Queryable, migrations: Migration[], requireHistorical = false): Promise<LedgerRecord[]> {
  if (!await ledgerExists(client)) throw new Error('Migration ledger is absent');
  const records = await recordedMigrations(client);
  validateLedgerRecords(records, migrations, requireHistorical);
  return records;
}

/*
 * This is deliberately a schema fingerprint, not a best-effort "required columns"
 * check. It describes the reconciled Render baseline, including its existing
 * tenants_pkey1 name, rather than a fresh database created by 001. It is used
 * only while the ledger contains no executed future migrations, since later
 * migrations may legitimately evolve these relations.
 */
const HISTORICAL_FINGERPRINT_SQL = `
WITH expected_columns(table_name, column_name, data_type, not_null, has_default) AS (VALUES
  ('tenants','id','uuid',true,true), ('tenants','name','text',true,false), ('tenants','active','boolean',false,true),
  ('tenants','grace_until','timestamp with time zone',false,false), ('tenants','plan','text',false,true),
  ('tenants','created_at','timestamp with time zone',false,true), ('tenants','stripe_customer_id','text',false,false),
  ('tenants','stripe_subscription_id','text',false,false), ('tenants','status','text',false,true),
  ('tenants','expires_at','timestamp with time zone',false,false), ('tenants','updated_at','timestamp with time zone',false,true),
  ('tenants','email','text',false,false), ('api_keys','key_hash','text',true,false), ('api_keys','tenant_id','uuid',false,false),
  ('api_keys','created_at','timestamp with time zone',false,true), ('api_keys','last_rotated_at','timestamp with time zone',false,false),
  ('usage_counters','tenant_id','uuid',true,false), ('usage_counters','period_start','date',true,false),
  ('usage_counters','minutes_used','integer',false,true), ('usage_counters','jobs','integer',false,true),
  ('usage_counters','egress_bytes','bigint',false,true)
), actual_columns AS (
  SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull,
    (d.oid IS NOT NULL)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
  WHERE n.nspname = 'public' AND c.relname IN ('tenants','api_keys','usage_counters')
), expected_defaults(table_name, column_name, expression) AS (VALUES
  ('tenants','id','gen_random_uuid()'), ('tenants','active','false'),
  ('tenants','plan','''standard''::text'), ('tenants','created_at','now()'),
  ('tenants','status','''inactive''::text'), ('tenants','updated_at','current_timestamp'),
  ('api_keys','created_at','now()'), ('usage_counters','minutes_used','0'),
  ('usage_counters','jobs','0'), ('usage_counters','egress_bytes','0')
), actual_defaults AS (
  SELECT c.relname, a.attname,
    regexp_replace(lower(pg_get_expr(d.adbin, d.adrelid)), '[[:space:]]+', '', 'g')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
  WHERE n.nspname = 'public' AND c.relname IN ('tenants','api_keys','usage_counters')
), expected_constraints(name, table_name, type, columns, referenced_table, referenced_columns, delete_action, update_action) AS (VALUES
  ('tenants_pkey1','tenants','p','id','','','',''),
  ('api_keys_pkey','api_keys','p','key_hash','','','',''),
  ('usage_counters_pkey','usage_counters','p','tenant_id','','','',''),
  ('tenants_stripe_customer_id_key','tenants','u','stripe_customer_id','','','',''),
  ('tenants_email_key','tenants','u','email','','','',''),
  ('api_keys_tenant_id_fkey','api_keys','f','tenant_id','tenants','id','c','a'),
  ('usage_counters_tenant_id_fkey','usage_counters','f','tenant_id','tenants','id','c','a')
), actual_constraints AS (
  SELECT con.conname, rel.relname, con.contype::text,
    (SELECT string_agg(att.attname, ',' ORDER BY key.ordinality)
       FROM unnest(con.conkey) WITH ORDINALITY key(attnum, ordinality)
       JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = key.attnum),
    coalesce(ref.relname, ''),
    coalesce((SELECT string_agg(att.attname, ',' ORDER BY key.ordinality)
       FROM unnest(con.confkey) WITH ORDINALITY key(attnum, ordinality)
       JOIN pg_attribute att ON att.attrelid = con.confrelid AND att.attnum = key.attnum), ''),
    CASE WHEN con.contype = 'f' THEN con.confdeltype::text ELSE '' END,
    CASE WHEN con.contype = 'f' THEN con.confupdtype::text ELSE '' END
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  LEFT JOIN pg_class ref ON ref.oid = con.confrelid
  WHERE n.nspname = 'public' AND con.conname IN (SELECT name FROM expected_constraints)
    AND con.convalidated AND NOT con.condeferrable AND NOT con.condeferred
), expected_indexes(name, table_name, columns, is_unique, predicate) AS (VALUES
  ('idx_tenants_active','tenants','active',false,'active=true'),
  ('idx_tenants_plan','tenants','plan',false,''), ('idx_usage_counters_period','usage_counters','period_start',false,''),
  ('idx_usage_counters_tenant_period','usage_counters','tenant_id,period_start',false,''),
  ('idx_api_keys_tenant_id','api_keys','tenant_id',false,''), ('idx_tenants_created_at','tenants','created_at',false,''),
  ('idx_tenants_stripe_customer','tenants','stripe_customer_id',false,''),
  ('idx_tenants_stripe_subscription','tenants','stripe_subscription_id',false,''),
  ('idx_tenants_status','tenants','status',false,''), ('idx_tenants_expires_at','tenants','expires_at',false,''),
  ('idx_tenants_email','tenants','email',false,'')
), actual_indexes AS (
  SELECT ic.relname, tc.relname,
    (SELECT string_agg(a.attname, ',' ORDER BY key.ordinality)
      FROM unnest(i.indkey) WITH ORDINALITY AS key(attnum, ordinality)
      JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = key.attnum),
    i.indisunique,
    regexp_replace(regexp_replace(coalesce(pg_get_expr(i.indpred, i.indrelid), ''), '[[:space:]]+', '', 'g'), '[()]', '', 'g')
  FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_class tc ON tc.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = tc.relnamespace
  WHERE n.nspname = 'public' AND ic.relname IN (SELECT name FROM expected_indexes)
)
SELECT
  (SELECT count(*) FROM expected_columns) = (SELECT count(*) FROM actual_columns)
  AND NOT EXISTS (SELECT 1 FROM expected_columns EXCEPT SELECT * FROM actual_columns)
  AND NOT EXISTS (SELECT 1 FROM actual_columns EXCEPT SELECT * FROM expected_columns)
  AND NOT EXISTS (SELECT 1 FROM expected_defaults EXCEPT SELECT * FROM actual_defaults)
  AND NOT EXISTS (SELECT 1 FROM expected_constraints EXCEPT SELECT * FROM actual_constraints)
  AND NOT EXISTS (SELECT 1 FROM actual_constraints EXCEPT SELECT * FROM expected_constraints)
  AND NOT EXISTS (SELECT 1 FROM expected_indexes EXCEPT SELECT * FROM actual_indexes)
  AND NOT EXISTS (SELECT 1 FROM actual_indexes EXCEPT SELECT * FROM expected_indexes)
  AND (SELECT count(*) FROM pg_constraint WHERE conname = 'tenants_status_check'
       AND conrelid = 'public.tenants'::regclass
       AND contype = 'c' AND convalidated AND NOT condeferrable
       AND pg_get_constraintdef(oid) = $$CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'expired'::text])))$$) = 1
  AND EXISTS (
    SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pgcrypto' AND e.extversion = '1.3' AND n.nspname = 'public'
  ) AS matches
`;

export async function verifyHistoricalSchemaFingerprint(client: Queryable): Promise<void> {
  const result = await client.query(HISTORICAL_FINGERPRINT_SQL);
  if (result.rows[0]?.matches !== true) {
    throw new Error('Historical schema fingerprint does not match migrations 001-008; refusing baseline');
  }
}

export async function baseline(client: Queryable, migrations: Migration[]): Promise<void> {
  // No DDL happens before this first, read-only fingerprint check.
  await verifyHistoricalSchemaFingerprint(client);
  if (await ledgerExists(client)) {
    const existing = await verifyLedger(client, migrations, true);
    if (existing.length !== HISTORICAL_MIGRATION_COUNT) throw new Error('Existing ledger is not exactly the 001-008 baseline; refusing baseline');
    return;
  }
  await client.query('BEGIN');
  try {
    await verifyHistoricalSchemaFingerprint(client);
    await createLedger(client);
    for (const migration of migrations.slice(0, HISTORICAL_MIGRATION_COUNT)) {
      await client.query(
        'INSERT INTO public.sinna_core_schema_migrations (version, filename, checksum, disposition) VALUES ($1, $2, $3, $4)',
        [migration.version, migration.filename, migration.checksum, 'baselined'],
      );
    }
    validateLedgerRecords(await recordedMigrations(client), migrations.slice(0, HISTORICAL_MIGRATION_COUNT), true);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function apply(client: Queryable, migrations: Migration[]): Promise<void> {
  const recorded = await verifyLedger(client, migrations, true);
  const applied = new Set(recorded.map((migration) => migration.version));
  for (const migration of migrations.filter((item) => item.version > HISTORICAL_MIGRATION_COUNT && !applied.has(item.version))) {
    if (forbiddenTransactionalSql.test(migration.sql)) {
      throw new Error(`Migration ${migration.filename} contains SQL that is not allowed in a transactional migration`);
    }
    await client.query('BEGIN');
    try {
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO public.sinna_core_schema_migrations (version, filename, checksum, disposition) VALUES ($1, $2, $3, $4)',
        [migration.version, migration.filename, migration.checksum, 'executed'],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}

export type MigrationCommand = 'status' | 'verify' | 'baseline' | 'apply';

export async function runMigrationCommand(command: MigrationCommand, options: { connectionString?: string; migrationsDirectory?: string; baselineConfirmed?: boolean } = {}): Promise<{ migrations: Migration[]; recorded: number[]; pending: number[] }> {
  const migrations = await discoverMigrations(options.migrationsDirectory);
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString, max: 1 });
  let client: PoolClient | undefined;
  let locked = false;
  try {
    client = await pool.connect();
    const lock = await client.query('SELECT pg_try_advisory_lock($1::bigint) AS locked', [ADVISORY_LOCK_ID]);
    locked = lock.rows[0]?.locked === true;
    if (!locked) throw new Error('Another migration command holds the migration ledger lock');
    if (command === 'baseline') {
      if (!options.baselineConfirmed) throw new Error('Baseline requires --through 008 and --confirm-baseline');
      await baseline(client, migrations);
    } else if (command === 'status') {
      // Status is intentionally read-only and reports an absent ledger as empty.
      const records = await ledgerExists(client) ? await recordedMigrations(client) : [];
      validateLedgerRecords(records, migrations);
      return { migrations, recorded: records.map((migration) => migration.version), pending: migrations.filter((m) => !records.some((r) => r.version === m.version)).map((m) => m.version) };
    } else {
      if (command === 'verify') {
        const records = await verifyLedger(client, migrations, true);
        if (!records.some((record) => record.version > HISTORICAL_MIGRATION_COUNT)) {
          await verifyHistoricalSchemaFingerprint(client);
        }
      } else await apply(client, migrations);
    }
    const records = await recordedMigrations(client);
    return { migrations, recorded: records.map((migration) => migration.version), pending: migrations.filter((m) => !records.some((r) => r.version === m.version)).map((m) => m.version) };
  } finally {
    try {
      if (locked && client) await client.query('SELECT pg_advisory_unlock($1::bigint)', [ADVISORY_LOCK_ID]);
    } finally {
      try {
        client?.release();
      } finally {
        await pool.end();
      }
    }
  }
}