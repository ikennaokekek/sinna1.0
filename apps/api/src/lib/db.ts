import { Pool } from 'pg';

export interface DatabaseClients {
  pool: Pool;
}

let cached: DatabaseClients | null = null;

export function getDb(): DatabaseClients {
  if (cached) return cached;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }
  const pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  cached = { pool };
  return cached;
}

export async function runMigrations(): Promise<void> {
  const { pool } = getDb();
  const fs = await import('fs');
  const path = await import('path');
  const migPath = path.resolve(__dirname, '..', '..', 'migrations', '001_init.sql');
  const sql = fs.readFileSync(migPath, 'utf-8');
  await pool.query(sql);
}

export async function seedTenantAndApiKey(params: { tenantName: string; plan?: string; apiKeyHash: string }): Promise<{ tenantId: string }>{
	const { pool } = getDb();
	const plan = (params.plan || 'standard').toLowerCase();
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const tenantRes = await client.query(
			`insert into tenants(name, active, plan) values ($1, true, $2) returning id`,
			[params.tenantName, plan]
		);
		const tenantId: string = tenantRes.rows[0].id;
		await client.query(
			`insert into api_keys(key_hash, tenant_id) values ($1, $2) on conflict (key_hash) do nothing`,
			[params.apiKeyHash, tenantId]
		);
		await client.query('COMMIT');
		return { tenantId };
	} catch (e) {
		try { await client.query('ROLLBACK'); } catch {}
		throw e;
	} finally {
		client.release();
	}
}


