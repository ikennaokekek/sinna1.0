import { Pool, PoolClient } from 'pg';
import { databaseSslConfig, withDeadline } from '@sinna/types';

export interface DatabaseClients {
  pool: Pool;
}

export interface ConnectionLease {
  quarantine(error: Error): void;
  isQuarantined(): boolean;
}

let cached: DatabaseClients | null = null;

function boundedInteger(
  value: string | undefined,
  fallback: number,
  name: string,
  min: number,
  max: number,
): number {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer`);
  const parsed = Number(value);
  if (parsed < min || parsed > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return parsed;
}

export function databasePoolConfig(env: NodeJS.ProcessEnv = process.env) {
  const max = boundedInteger(env.DB_POOL_MAX, 5, 'DB_POOL_MAX', 1, 20);
  const min = boundedInteger(env.DB_POOL_MIN, 0, 'DB_POOL_MIN', 0, max);
  return {
    max,
    min,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 1_500,
    maxUses: 7_500,
  };
}

export function getDb(): DatabaseClients {
  if (cached) return cached;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }
  const ssl = databaseSslConfig();
  const pool = new Pool({
    connectionString,
    ssl,
    ...databasePoolConfig(),
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

/** Drop cached pool so the next `getDb()` creates a fresh one (Vitest only). */
export function resetDbClientsForTests(closePool = true): void {
  if (process.env.VITEST !== 'true') return;
  const pool = cached?.pool;
  cached = null;
  if (closePool && pool) {
    try {
      void Promise.resolve(pool.end()).catch(() => undefined);
    } catch {
      // Test doubles may expose a synchronous end method.
    }
  }
}

/**
 * Execute a function with a database connection, ensuring proper release
 * @param fn Function to execute with the connection
 * @returns Result of the function
 */
export async function withConnection<T>(
  fn: (client: PoolClient, lease: ConnectionLease) => Promise<T>
): Promise<T> {
  const { pool } = getDb();
  const client = await pool.connect();
  let quarantineError: Error | undefined;
  const lease: ConnectionLease = {
    quarantine(error) {
      quarantineError ??= error;
    },
    isQuarantined() {
      return quarantineError !== undefined;
    },
  };
  try {
    return await fn(client, lease);
  } finally {
    client.release(quarantineError);
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
export async function checkPoolHealth(
  timeoutMs = 2_000,
  query: () => Promise<{ rows: unknown[] }> = async () => {
    const result = await getDb().pool.query({
      text: 'SELECT NOW()',
      query_timeout: timeoutMs,
    } as any);
    return { rows: result.rows };
  },
): Promise<boolean> {
  try {
    const result = await withDeadline(query(), timeoutMs, 'PostgreSQL health check deadline exceeded');
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


