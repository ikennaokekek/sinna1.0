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
  const ssl = process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined;
  // Optimized connection pooling:
  // - max: Maximum number of clients in the pool (10 is good for most apps)
  // - min: Minimum number of clients to keep in the pool (2 for better performance)
  // - idleTimeoutMillis: Close idle clients after 30 seconds
  // - connectionTimeoutMillis: Wait 5 seconds for connection
  // - maxUses: Close connections after 7500 uses to prevent memory leaks
  const pool = new Pool({
    connectionString,
    ssl,
    max: 10,
    min: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5000,
    maxUses: 7500,
  });
  cached = { pool };
  return cached;
}

export async function runMigrations(): Promise<void> {
  const { pool } = getDb();
  const fs = await import('fs');
  const path = await import('path');
  const migrationsDir = path.resolve(__dirname, '..', '..', 'migrations');
  
  // Get all .sql files and sort them
  const files = fs.readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith('.sql'))
    .sort();
  
  // Run each migration in order
  for (const file of files) {
    const migPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(migPath, 'utf-8');
    await pool.query(sql);
  }
}

export async function seedTenantAndApiKey(params: { tenantName: string; plan?: string; apiKeyHash: string }): Promise<{ tenantId: string }>{
	const { pool } = getDb();
	const plan = (params.plan || 'standard').toLowerCase();
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		
		// 1. Check if tenant exists by name
		const existingTenantRes = await client.query(
			`SELECT id FROM tenants WHERE name = $1 LIMIT 1`,
			[params.tenantName]
		);
		
		let tenantId: string;
		
		if (existingTenantRes.rows.length > 0) {
			// Tenant exists, use existing tenant_id
			tenantId = existingTenantRes.rows[0].id as string;
			
			// Verify tenant still exists (defensive check)
			const verifyRes = await client.query(
				`SELECT id FROM tenants WHERE id = $1`,
				[tenantId]
			);
			
			if (verifyRes.rows.length === 0) {
				throw new Error(`Invalid tenant_id: ${tenantId} - tenant not found in database`);
			}
		} else {
			// 2. Create tenant if not exists
			const tenantRes = await client.query(
				`INSERT INTO tenants(name, active, plan) VALUES ($1, true, $2) RETURNING id`,
				[params.tenantName, plan]
			);
			
			if (tenantRes.rows.length === 0) {
				throw new Error('Failed to create tenant: no ID returned');
			}
			
			tenantId = tenantRes.rows[0].id as string;
			
			if (!tenantId) {
				throw new Error('Failed to create tenant: tenantId is null or undefined');
			}
		}
		
		// 3. Now insert API key linked to the valid tenant_id
		await client.query(
			`INSERT INTO api_keys(key_hash, tenant_id) VALUES ($1, $2) ON CONFLICT (key_hash) DO NOTHING`,
			[params.apiKeyHash, tenantId]
		);
		
		await client.query('COMMIT');
		return { tenantId };
	} catch (e: any) {
		try { await client.query('ROLLBACK'); } catch {}
		
		// Handle specific database errors
		if (e?.code === '23503') {
			// Foreign key violation
			throw new Error(`Invalid tenant_id foreign key: ${e.message}`);
		} else if (e?.code === '23505') {
			// Unique constraint violation (shouldn't happen with ON CONFLICT DO NOTHING, but handle it)
			throw new Error(`API key already exists: ${e.message}`);
		} else if (e?.code === '23502') {
			// Not null violation
			throw new Error(`Required field missing: ${e.message}`);
		}
		
		// Re-throw with original error if not a known database error
		throw e;
	} finally {
		client.release();
	}
}


