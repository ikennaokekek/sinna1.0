import { getDb } from './db';
import crypto from 'crypto';

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
    const email = isProduction ? 'motion24inc@gmail.com' : 'ikennaokeke1996@gmail.com';
    const tenantName = isProduction ? 'Sinna Tenant' : 'Dev Tenant';
    
    console.log(`[seedTenantAndApiKey] Environment: ${isProduction ? 'production' : 'development'}`);
    console.log(`[seedTenantAndApiKey] Tenant email: ${email}`);
    
    // 2. Check if tenant exists by email (stored in name field)
    const existingTenantRes = await client.query(
      `SELECT id FROM tenants WHERE name = $1 LIMIT 1`,
      [email]
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
        [email, 'standard']
      );
      
      if (tenantRes.rows.length === 0) {
        throw new Error('Failed to create tenant: no ID returned');
      }
      
      tenantId = tenantRes.rows[0].id as string;
      console.log(`[seedTenantAndApiKey] ✅ Tenant created: ${tenantId}`);
    }
    
    // Verify tenant_id is valid before proceeding
    if (!tenantId) {
      throw new Error('Invalid tenant_id: tenantId is null or undefined');
    }
    
    // 4. Insert API key linked to this tenantId
    // Generate a test API key hash
    const testSecret = 'test-secret-key';
    const keyHash = crypto.createHash('sha256').update(testSecret).digest('hex');
    
    // Insert API key (ON CONFLICT DO NOTHING makes it idempotent)
    await client.query(
      `INSERT INTO api_keys(key_hash, tenant_id) VALUES ($1, $2) ON CONFLICT (key_hash) DO NOTHING`,
      [keyHash, tenantId]
    );
    
    console.log(`[seedTenantAndApiKey] ✅ API key linked to tenant: ${tenantId}`);
    
    await client.query('COMMIT');
    console.log(`[seedTenantAndApiKey] ✅ Seed complete`);
  } catch (error: any) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[seedTenantAndApiKey] ❌ Rollback failed:', rollbackError);
    }
    
    console.error('[seedTenantAndApiKey] ❌ Error:', error.message);
    if (error.code) {
      console.error(`[seedTenantAndApiKey] ❌ Database error code: ${error.code}`);
    }
    throw error;
  } finally {
    client.release();
  }
}

