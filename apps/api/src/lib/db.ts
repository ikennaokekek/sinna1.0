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
  
  console.log(`[runMigrations] Found ${files.length} migration files: ${files.join(', ')}`);
  
  // Run each migration in order
  for (const file of files) {
    const migPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(migPath, 'utf-8');
    console.log(`[runMigrations] Running migration: ${file}`);
    try {
      await pool.query(sql);
      console.log(`[runMigrations] ✅ Successfully ran migration: ${file}`);
    } catch (error: any) {
      console.error(`[runMigrations] ❌ Failed to run migration ${file}:`, error.message);
      console.error(`[runMigrations] Error code: ${error.code}, Detail: ${error.detail}`);
      throw new Error(`Migration ${file} failed: ${error.message}`);
    }
  }
  
  // Seed tenant and API key after migrations complete
  // This is optional and failures should not block migrations
  // Skip seeding in CI to avoid hanging (CI will use test data)
  const isCI = process.env.CI === 'true';
  if (!isCI) {
    try {
      const { seedTenantAndApiKey } = await import('./seedTenantAndApiKey');
      await seedTenantAndApiKey();
      console.log('[runMigrations] ✅ Tenant and API key seeding completed');
    } catch (error: any) {
      // Log but don't fail migrations if seeding fails
      // This allows migrations to complete even if seeding has issues
      console.error('[runMigrations] ⚠️  Failed to seed tenant and API key (non-fatal):', error?.message || error);
      if (error?.code) {
        console.error(`[runMigrations] Database error code: ${error.code}`);
      }
      // Continue - migrations are complete, seeding is optional
    }
  } else {
    console.log('[runMigrations] ⏭️  Skipping seeding in CI environment');
  }
  
  // CRITICAL: Close pool connection to allow process to exit
  // This prevents GitHub Actions from hanging indefinitely
  // Only close if we're in a migration script context (not main app)
  const isStandaloneMigration = process.argv[1]?.includes('migrate') || process.env.MIGRATE_STANDALONE === 'true';
  if (isStandaloneMigration || isCI) {
    await pool.end();
    console.log('[runMigrations] ✅ Database pool closed');
  }
}

/**
 * Get environment-specific tenant email
 * Development: ikennaokeke1996@gmail.com
 * Production: motion24inc@gmail.com
 */
function getDefaultTenantEmail(): string {
	const isDev = process.env.NODE_ENV !== 'production';
	return isDev ? 'ikennaokeke1996@gmail.com' : 'motion24inc@gmail.com';
}

export async function seedTenantAndApiKey(params: { tenantName?: string; plan?: string; apiKeyHash: string }): Promise<{ tenantId: string }>{
	const { pool } = getDb();
	const plan = (params.plan || 'standard').toLowerCase();
	
	// Use environment-specific email if tenantName not provided
	const tenantEmail = params.tenantName || getDefaultTenantEmail();
	
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		
		// 1. Check if tenant exists by name (email)
		const existingTenantRes = await client.query(
			`SELECT id FROM tenants WHERE name = $1 LIMIT 1`,
			[tenantEmail]
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
				[tenantEmail, plan]
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


