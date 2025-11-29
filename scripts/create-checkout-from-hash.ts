#!/usr/bin/env tsx
/**
 * Create checkout link from API key hash
 * Usage: tsx scripts/create-checkout-from-hash.ts <hash>
 */

import { getDb } from '../apps/api/src/lib/db';
import * as crypto from 'crypto';

const hash = process.argv[2] || 'ca1bc74f5dfe57d90a2df7ccab7228f386a2f3612d177b02a74262762fece7c4';

async function main() {
  console.log('🔍 Looking up tenant for hash...\n');
  
  const { pool } = getDb();
  
  // Check if this hash exists in database
  const result = await pool.query(
    'SELECT t.id, t.name, t.active, t.plan FROM api_keys k JOIN tenants t ON t.id = k.tenant_id WHERE k.key_hash = $1',
    [hash]
  );
  
  if (result.rows.length === 0) {
    console.log('❌ Hash not found in database');
    console.log('\n💡 Generating new API key and calling billing endpoint...\n');
    
    // Generate new API key for a test tenant
    const randomBytes = crypto.randomBytes(24);
    const randomString = randomBytes.toString('base64')
      .replace(/[+/=]/g, '')
      .toLowerCase()
      .substring(0, 32);
    
    const apiKey = `sk_live_${randomString}`;
    const hashed = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    // Create tenant and API key
    const { seedTenantAndApiKey } = await import('../apps/api/src/lib/db');
    const { tenantId } = await seedTenantAndApiKey({
      tenantName: 'test@example.com',
      plan: 'standard',
      apiKeyHash: hashed,
    });
    
    console.log('✅ Created tenant and API key');
    console.log(`🔑 API Key: ${apiKey}\n`);
    
    // Call billing endpoint
    console.log('🚀 Calling billing endpoint...\n');
    const response = await fetch('https://sinna1-0.onrender.com/v1/billing/subscribe', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });
    
    const data = await response.json();
    
    if (response.ok && data.success && data.data?.url) {
      console.log('='.repeat(70));
      console.log('✅ CHECKOUT LINK CREATED!');
      console.log('='.repeat(70));
      console.log('\n' + data.data.url + '\n');
      console.log('='.repeat(70));
    } else {
      console.error('❌ Error:', data);
    }
    
    return;
  }
  
  const tenant = result.rows[0];
  console.log('✅ Found tenant:', tenant.name);
  console.log(`   Tenant ID: ${tenant.id}`);
  console.log(`   Plan: ${tenant.plan}\n`);
  
  // Generate new API key for this tenant
  const randomBytes = crypto.randomBytes(24);
  const randomString = randomBytes.toString('base64')
    .replace(/[+/=]/g, '')
    .toLowerCase()
    .substring(0, 32);
  
  const apiKey = `sk_live_${randomString}`;
  const hashed = crypto.createHash('sha256').update(apiKey).digest('hex');
  
  await pool.query(
    'INSERT INTO api_keys(key_hash, tenant_id) VALUES ($1, $2)',
    [hashed, tenant.id]
  );
  
  console.log('🔑 Generated new API key:', apiKey);
  console.log('\n🚀 Calling billing endpoint...\n');
  
  // Call billing endpoint
  const response = await fetch('https://sinna1-0.onrender.com/v1/billing/subscribe', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
  });
  
  const data = await response.json();
  
  if (response.ok && data.success && data.data?.url) {
    console.log('='.repeat(70));
    console.log('✅ CHECKOUT LINK CREATED!');
    console.log('='.repeat(70));
    console.log('\n' + data.data.url + '\n');
    console.log('='.repeat(70));
    console.log(`\n📋 Session Details:`);
    console.log(`   Tenant: ${tenant.name}`);
    console.log(`   API Key: ${apiKey}`);
  } else {
    console.error('❌ Error creating checkout:', data);
    if (data.error === 'stripe_unconfigured') {
      console.error('\n💡 Stripe is not configured on the server.');
      console.error('💡 Need STRIPE_SECRET_KEY and STRIPE_STANDARD_PRICE_ID in Render environment variables.');
    }
  }
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});

