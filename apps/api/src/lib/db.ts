import { Pool, PoolClient } from 'pg';

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

  // Add connection pool event handlers for monitoring
  pool.on('error', (err) => {
    console.error('[DB Pool] Unexpected error on idle client:', err);
  });

  pool.on('connect', () => {
    console.log('[DB Pool] New client connected');
  });

  pool.on('remove', () => {
    console.log('[DB Pool] Client removed from pool');
  });

  cached = { pool };
  return cached;
}

/**
 * Execute a function with a database connection, ensuring proper release
 * @param fn Function to execute with the connection
 * @returns Result of the function
 */
export async function withConnection<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const { pool } = getDb();
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Execute a function within a database transaction, with automatic rollback on error
 * @param fn Function to execute within the transaction
 * @returns Result of the function
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withConnection(async (client) => {
    await client.query('BEGIN');
    try {
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('[DB Transaction] Rollback failed:', rollbackError);
      }
      throw error;
    }
  });
}

/**
 * Check if the database pool is healthy
 * @returns true if pool is healthy, false otherwise
 */
export async function checkPoolHealth(): Promise<boolean> {
  try {
    const { pool } = getDb();
    const result = await pool.query('SELECT NOW()');
    return result.rows.length > 0;
  } catch (error) {
    console.error('[DB Health Check] Failed:', error);
    return false;
  }
}

/**
 * Retry a database operation with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries (default: 3)
 * @param initialDelay Initial delay in milliseconds (default: 100)
 * @returns Result of the function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 100
): Promise<T> {
  let lastError: Error | unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on non-transient errors
      const isTransient = 
        error?.code === 'ECONNREFUSED' ||
        error?.code === 'ETIMEDOUT' ||
        error?.code === 'ENOTFOUND' ||
        error?.message?.includes('Connection is closed') ||
        error?.message?.includes('terminating connection') ||
        error?.message?.includes('server closed the connection');
      
      if (!isTransient || attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff: 100ms, 200ms, 400ms, etc.
      const delay = initialDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
      console.warn(`[DB Retry] Attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${delay}ms...`);
    }
  }
  throw lastError;
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


