#!/usr/bin/env tsx
/**
 * Manually Send API Key Email
 * 
 * Use this if payment completed but email wasn't sent.
 * This will find or create tenant, generate API key, and send email.
 * 
 * Usage: pnpm tsx scripts/manually-send-api-key-email.ts <email>
 */

import { getDb } from '../apps/api/src/lib/db';
import { sendApiKeyEmail } from '../apps/api/src/utils/email';
import * as crypto from 'crypto';

const email = process.argv[2] || 'ikennaokeke1996@gmail.com';

async function main() {
  console.log(`🔍 Looking up tenant for: ${email}\n`);
  
  const { pool } = getDb();
  
  // Find tenant
  const tenantResult = await pool.query(
    'SELECT id, name, active, plan FROM tenants WHERE name = $1',
    [email]
  );
  
  let tenantId: string;
  
  if (tenantResult.rows.length === 0) {
    console.log('❌ No tenant found. Creating new tenant...');
    
    // Generate API key
    const randomBytes = crypto.randomBytes(24);
    const randomString = randomBytes.toString('base64')
      .replace(/[+/=]/g, '')
      .toLowerCase()
      .substring(0, 32);
    
    const apiKey = `sk_live_${randomString}`;
    const hashed = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    // Create tenant and API key
    const { seedTenantAndApiKey } = await import('../apps/api/src/lib/db');
    const result = await seedTenantAndApiKey({
      tenantName: email,
      plan: 'standard',
      apiKeyHash: hashed,
    });
    
    tenantId = result.tenantId;
    console.log(`✅ Created tenant: ${tenantId}`);
    console.log(`🔑 Generated API key: ${apiKey}\n`);
    
    // Send email
    console.log(`📧 Sending email to ${email}...`);
    try {
      await sendApiKeyEmail(email, apiKey);
      console.log('✅ Email sent successfully!\n');
    } catch (error) {
      console.error('❌ Failed to send email:', error instanceof Error ? error.message : String(error));
      console.log('\n🔑 API KEY (MANUAL):');
      console.log('='.repeat(70));
      console.log(apiKey);
      console.log('='.repeat(70));
      console.log('\n💡 Email failed, but API key is shown above. Send it manually to:', email);
    }
    
    return;
  }
  
  const tenant = tenantResult.rows[0];
  tenantId = tenant.id;
  
  console.log(`✅ Found tenant: ${tenantId}`);
  console.log(`   Email: ${tenant.name}`);
  console.log(`   Active: ${tenant.active}`);
  console.log(`   Plan: ${tenant.plan}\n`);
  
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
    [hashed, tenantId]
  );
  
  console.log(`🔑 Generated new API key: ${apiKey}\n`);
  
  // Send email
  console.log(`📧 Sending email to ${email}...`);
  try {
    await sendApiKeyEmail(email, apiKey);
    console.log('✅ Email sent successfully!\n');
    console.log('📧 Check inbox:', email);
    console.log('   Subject: "Your Sinna API Key is Ready! 🎉"');
  } catch (error) {
    console.error('❌ Failed to send email:', error instanceof Error ? error.message : String(error));
    console.log('\n🔑 API KEY (MANUAL - Email Failed):');
    console.log('='.repeat(70));
    console.log(apiKey);
    console.log('='.repeat(70));
    console.log('\n💡 Email service failed. Send this API key manually to:', email);
    console.log('\n🔍 Check Render environment variables:');
    console.log('   - RESEND_API_KEY or SENDGRID_API_KEY');
    console.log('   - NOTIFY_FROM_EMAIL');
  }
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});

