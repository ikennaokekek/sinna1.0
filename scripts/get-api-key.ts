#!/usr/bin/env tsx
/**
 * Get API Key - Simple version (no email, just print key)
 * Usage: tsx scripts/get-api-key.ts <email>
 */

import { getDb } from '../apps/api/src/lib/db';
import * as crypto from 'crypto';

const email = process.argv[2] || 'ikennaokeke1996@gmail.com';

async function main() {
  console.log(`🔍 Getting API key for: ${email}\n`);
  
  const { pool } = getDb();
  
  // Find tenant
  const tenantResult = await pool.query(
    'SELECT id, name, active, plan FROM tenants WHERE name = $1',
    [email]
  );
  
  if (tenantResult.rows.length === 0) {
    console.log('❌ No tenant found. Creating new tenant...');
    
    const randomBytes = crypto.randomBytes(24);
    const randomString = randomBytes.toString('base64')
      .replace(/[+/=]/g, '')
      .toLowerCase()
      .substring(0, 32);
    
    const apiKey = `sk_live_${randomString}`;
    const hashed = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    const { seedTenantAndApiKey } = await import('../apps/api/src/lib/db');
    const { tenantId } = await seedTenantAndApiKey({
      tenantName: email,
      plan: 'standard',
      apiKeyHash: hashed,
    });
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ TENANT CREATED');
    console.log('='.repeat(70));
    console.log(`Tenant ID: ${tenantId}`);
    console.log(`Email: ${email}`);
    console.log(`Plan: standard`);
    console.log('\n' + '='.repeat(70));
    console.log('🔑 YOUR API KEY (COPY THIS):');
    console.log('='.repeat(70));
    console.log(apiKey);
    console.log('='.repeat(70));
    console.log('\n📋 Usage:');
    console.log(`curl -H "X-API-Key: ${apiKey}" https://sinna.site/health`);
    return;
  }
  
  const tenant = tenantResult.rows[0];
  
  // Check for existing keys
  const keysResult = await pool.query(
    'SELECT key_hash, created_at FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenant.id]
  );
  
  // Generate new key (can't retrieve old ones - they're hashed)
  const randomBytes = crypto.randomBytes(24);
  const randomString = randomBytes.toString('base64')
    .replace(/[+/=]/g, '')
    .toLowerCase()
    .substring(0, 32);
  
  const apiKey = `sk_live_${randomString}`;
  const hashed = crypto.createHash('sha256').update(apiKey).digest('hex');
  
  // Insert new API key
  await pool.query(
    'INSERT INTO api_keys(key_hash, tenant_id) VALUES ($1, $2)',
    [hashed, tenant.id]
  );
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ TENANT FOUND');
  console.log('='.repeat(70));
  console.log(`Tenant ID: ${tenant.id}`);
  console.log(`Email: ${tenant.name}`);
  console.log(`Active: ${tenant.active}`);
  console.log(`Plan: ${tenant.plan}`);
  console.log(`Existing Keys: ${keysResult.rows.length}`);
  console.log('\n' + '='.repeat(70));
  console.log('🔑 YOUR NEW API KEY (COPY THIS):');
  console.log('='.repeat(70));
  console.log(apiKey);
  console.log('='.repeat(70));
  console.log('\n📋 Test it:');
  console.log(`curl -H "X-API-Key: ${apiKey}" https://sinna.site/health`);
  console.log(`curl -H "X-API-Key: ${apiKey}" https://sinna.site/v1/me/subscription`);
  console.log('\n✅ Key saved to database. You can use it immediately!');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});

