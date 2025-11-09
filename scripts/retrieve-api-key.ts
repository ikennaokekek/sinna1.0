#!/usr/bin/env tsx
/**
 * Script to retrieve API key for a customer and send it via email
 * Usage: tsx scripts/retrieve-api-key.ts <email>
 */

import { getDb } from '../apps/api/src/lib/db';
import { sendEmailNotice } from '../apps/api/src/lib/email';
import * as crypto from 'crypto';

const email = process.argv[2] || 'road2yaadi@gmail.com';

async function main() {
  console.log(`🔍 Looking up API key for: ${email}`);
  
  const { pool } = getDb();
  
  // Find tenant by email (stored as tenant name)
  const tenantResult = await pool.query(
    'SELECT id, name, active, plan, stripe_customer_id, stripe_subscription_id FROM tenants WHERE name = $1',
    [email]
  );
  
  if (tenantResult.rows.length === 0) {
    console.log('❌ No tenant found for this email. Creating new tenant and API key...');
    
    // Generate new API key
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
      tenantName: email,
      plan: 'standard',
      apiKeyHash: hashed,
    });
    
    console.log(`✅ Created tenant: ${tenantId}`);
    console.log(`🔑 API Key: ${apiKey}`);
    
    // Send email
    console.log(`📧 Sending email to ${email}...`);
    await sendEmailNotice(
      email,
      'Your Sinna API Key is Ready! 🎉',
      `Your API key: ${apiKey}\n\nBase URL: ${process.env.BASE_URL_PUBLIC || 'https://sinna.site'}\n\nKeep this key secure and use it in the X-API-Key header for all requests.`
    );
    
    console.log('✅ Email sent!');
    return;
  }
  
  const tenant = tenantResult.rows[0];
  console.log(`✅ Found tenant: ${tenant.id} (${tenant.name})`);
  console.log(`   Active: ${tenant.active}`);
  console.log(`   Plan: ${tenant.plan}`);
  console.log(`   Stripe Customer: ${tenant.stripe_customer_id || 'N/A'}`);
  console.log(`   Stripe Subscription: ${tenant.stripe_subscription_id || 'N/A'}`);
  
  // Get API keys for this tenant
  const keysResult = await pool.query(
    'SELECT key_hash, created_at FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
    [tenant.id]
  );
  
  if (keysResult.rows.length === 0) {
    console.log('⚠️  No API key found in database. Generating new one...');
    
    // Generate new API key
    const randomBytes = crypto.randomBytes(24);
    const randomString = randomBytes.toString('base64')
      .replace(/[+/=]/g, '')
      .toLowerCase()
      .substring(0, 32);
    
    const apiKey = `sk_live_${randomString}`;
    const hashed = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    // Insert API key
    await pool.query(
      'INSERT INTO api_keys(key_hash, tenant_id) VALUES ($1, $2)',
      [hashed, tenant.id]
    );
    
    console.log(`🔑 Generated new API Key: ${apiKey}`);
    
    // Send email
    console.log(`📧 Sending email to ${email}...`);
    await sendEmailNotice(
      email,
      'Your Sinna API Key is Ready! 🎉',
      `Your API key: ${apiKey}\n\nBase URL: ${process.env.BASE_URL_PUBLIC || 'https://sinna.site'}\n\nKeep this key secure and use it in the X-API-Key header for all requests.`
    );
    
    console.log('✅ Email sent!');
    return;
  }
  
  const keyHash = keysResult.rows[0].key_hash;
  console.log(`🔑 Found API key hash: ${keyHash.substring(0, 20)}...`);
  console.log(`   Created: ${keysResult.rows[0].created_at}`);
  
  // We can't reverse the hash, but we can generate a new one and update
  console.log('\n⚠️  Cannot retrieve original API key (it\'s hashed). Generating new one...');
  
  const randomBytes = crypto.randomBytes(24);
  const randomString = randomBytes.toString('base64')
    .replace(/[+/=]/g, '')
    .toLowerCase()
    .substring(0, 32);
  
  const apiKey = `sk_live_${randomString}`;
  const hashed = crypto.createHash('sha256').update(apiKey).digest('hex');
  
  // Insert new API key (old one remains valid too)
  await pool.query(
    'INSERT INTO api_keys(key_hash, tenant_id) VALUES ($1, $2)',
    [hashed, tenant.id]
  );
  
  console.log(`🔑 New API Key: ${apiKey}`);
  
  // Send email
  console.log(`📧 Sending email to ${email}...`);
  await sendEmailNotice(
    email,
    'Your Sinna API Key is Ready! 🎉',
    `Your API key: ${apiKey}\n\nBase URL: ${process.env.BASE_URL_PUBLIC || 'https://sinna.site'}\n\nKeep this key secure and use it in the X-API-Key header for all requests.\n\nNote: This is a new API key. Your previous key (if any) is still valid.`
  );
  
  console.log('✅ Email sent!');
  console.log(`\n📋 Summary:`);
  console.log(`   Email: ${email}`);
  console.log(`   API Key: ${apiKey}`);
  console.log(`   Base URL: ${process.env.BASE_URL_PUBLIC || 'https://sinna.site'}`);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});

