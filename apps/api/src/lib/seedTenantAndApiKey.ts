import { getDb } from './db';
import crypto, { randomBytes } from 'crypto';

/**
 * Generate secure API key secret based on environment
 * - Production: Uses SEED_API_KEY_SECRET from environment
 * - Development: Generates random 32-byte hex string
 */
function getApiKeySecret(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    const secret = process.env.SEED_API_KEY_SECRET;
    if (!secret) {
      throw new Error('SEED_API_KEY_SECRET environment variable is required in production');
    }
    return secret;
  }
  
  // Development: Generate random secure key
  return randomBytes(32).toString('hex');
}

/**
 * Seed tenant and API key with environment-specific email
 * - Production: motion24inc@gmail.com
 * - Development: ikennaokeke1996@gmail.com
 * 
 * This function is idempotent and safe to run multiple times.
 * It will find existing tenant or create new one, then link API key.
 */
export async function seedTenantAndApiKey(): Promise<void> {
  const { pool } = getDb();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Determine tenant email based on NODE_ENV
    const isProduction = process.env.NODE_ENV === 'production';
    const tenantEmail = isProduction ? 'motion24inc@gmail.com' : 'ikennaokeke1996@gmail.com';
    const tenantName = 'Test Tenant';
    
    console.log(`[seedTenantAndApiKey] Environment: ${isProduction ? 'production' : 'development'}`);
    console.log(`[seedTenantAndApiKey] Tenant email: ${tenantEmail}`);
    
    // 2. Check if tenant exists by email (stored in name field)
    const existingTenantRes = await client.query(
      `SELECT id FROM tenants WHERE name = $1 LIMIT 1`,
      [tenantEmail]
    );
    
    let tenantId: string;
    
    if (existingTenantRes.rows.length > 0) {
      // Tenant exists, use existing tenant_id
      tenantId = existingTenantRes.rows[0].id as string;
      console.log(`[seedTenantAndApiKey] ✅ Tenant found: ${tenantId}`);
    } else {
      // 3. Create tenant if it doesn't exist
      const tenantRes = await client.query(
        `INSERT INTO tenants(name, active, plan) VALUES ($1, true, $2) RETURNING id`,
        [tenantEmail, 'standard']
      );
      
      if (tenantRes.rows.length === 0) {
        throw new Error('Failed to create tenant: no ID returned');
      }
      
      tenantId = tenantRes.rows[0].id as string;
      
      if (!tenantId) {
        throw new Error('Failed to create tenant: tenantId is null or undefined');
      }
      
      console.log(`[seedTenantAndApiKey] ✅ Tenant created: ${tenantId}`);
    }
    
    // CRITICAL: Verify tenant_id exists in database before inserting API key
    // This prevents foreign key errors
    const verifyTenantRes = await client.query(
      `SELECT id FROM tenants WHERE id = $1`,
      [tenantId]
    );
    
    if (verifyTenantRes.rows.length === 0) {
      throw new Error(`Invalid tenant_id: ${tenantId} - tenant not found in database after creation/lookup`);
    }
    
    console.log(`[seedTenantAndApiKey] ✅ Tenant verified: ${tenantId}`);
    
    // 4. Generate secure API key secret
    const apiKeySecret = getApiKeySecret();
    const keyHash = crypto.createHash('sha256').update(apiKeySecret).digest('hex');
    
    // 5. Insert API key linked to this tenantId
    // ON CONFLICT DO NOTHING makes it idempotent
    try {
      await client.query(
        `INSERT INTO api_keys(key_hash, tenant_id) VALUES ($1, $2) ON CONFLICT (key_hash) DO NOTHING`,
        [keyHash, tenantId]
      );
      console.log(`[seedTenantAndApiKey] ✅ API key linked to tenant: ${tenantId}`);
    } catch (insertError: any) {
      // Handle foreign key violation specifically
      if (insertError?.code === '23503') {
        // Foreign key violation - tenant doesn't exist
        throw new Error(`Foreign key violation: tenant_id ${tenantId} does not exist in tenants table. Error: ${insertError.message}`);
      }
      throw insertError;
    }
    
    await client.query('COMMIT');
    console.log('✅ Tenant + API key seeded successfully.');
  } catch (error: any) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[seedTenantAndApiKey] ❌ Rollback failed:', rollbackError);
    }
    
    console.error('❌ Seeding error:', error?.code || error.message);
    if (error.code) {
      console.error(`[seedTenantAndApiKey] ❌ Database error code: ${error.code}`);
    }
    if (error.detail) {
      console.error(`[seedTenantAndApiKey] ❌ Database error detail: ${error.detail}`);
    }
    
    // Re-throw error so caller can handle it
    // runMigrations will catch and log without failing migrations
    throw error;
  } finally {
    client.release();
  }
}

