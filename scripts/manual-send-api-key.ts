#!/usr/bin/env tsx
/**
 * Manual API Key Email Sender
 * Sends API key email directly without webhook
 */

import { sendApiKeyEmail } from '../apps/api/src/utils/email';
import { getDb, seedTenantAndApiKey } from '../apps/api/src/lib/db';
import { createApiKey } from '../apps/api/src/utils/keys';

const EMAIL = process.env.TEST_EMAIL || process.argv[2] || 'ikennaokeke1996@gmail.com';

async function main() {
  console.log('🔑 Manual API Key Email Sender');
  console.log(`📧 Email: ${EMAIL}`);
  console.log('');

  try {
    const { pool } = getDb();
    
    // Check if tenant exists
    const tenantResult = await pool.query(
      'SELECT id, name, active FROM tenants WHERE name = $1',
      [EMAIL]
    );

    let tenantId: string;
    let apiKey: string;

    if (tenantResult.rows.length > 0) {
      // Tenant exists, get or create API key
      tenantId = tenantResult.rows[0].id;
      console.log(`✅ Tenant found: ${tenantId}`);
      
      // Check for existing API key
      const keyResult = await pool.query(
        'SELECT key_hash FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
        [tenantId]
      );

      if (keyResult.rows.length > 0) {
        // API key exists but we can't retrieve it (it's hashed)
        // Generate a new one
        console.log('⚠️  API key exists but is hashed. Generating new key...');
        const { apiKey: newKey, hashed } = createApiKey();
        apiKey = newKey;
        
        await pool.query(
          'INSERT INTO api_keys (tenant_id, key_hash) VALUES ($1, $2)',
          [tenantId, hashed]
        );
        console.log('✅ New API key generated');
      } else {
        // No API key, generate one
        const { apiKey: newKey, hashed } = createApiKey();
        apiKey = newKey;
        
        await pool.query(
          'INSERT INTO api_keys (tenant_id, key_hash) VALUES ($1, $2)',
          [tenantId, hashed]
        );
        console.log('✅ API key generated');
      }
    } else {
      // Create new tenant and API key
      console.log('📝 Creating new tenant...');
      const { apiKey: newKey, hashed } = createApiKey();
      apiKey = newKey;

      const result = await seedTenantAndApiKey({
        tenantName: EMAIL,
        plan: 'standard',
        apiKeyHash: hashed,
      });
      tenantId = result.tenantId;
      console.log(`✅ Tenant created: ${tenantId}`);
    }

    console.log('');
    console.log('📧 Sending email...');
    console.log(`From: ${process.env.NOTIFY_FROM_EMAIL || 'donotreply@sinna.site'}`);
    console.log(`To: ${EMAIL}`);
    console.log(`Resend Key: ${process.env.RESEND_API_KEY ? '✅ Present' : '❌ Missing'}`);
    console.log(`SendGrid Key: ${process.env.SENDGRID_API_KEY ? '✅ Present' : '❌ Missing'}`);
    console.log('');

    try {
      await sendApiKeyEmail(EMAIL, apiKey);
      console.log('✅ Email sent successfully!');
      console.log(`📬 Check your inbox: ${EMAIL}`);
    } catch (emailError) {
      console.error('❌ Email failed:', emailError instanceof Error ? emailError.message : String(emailError));
      console.log('');
      console.log('⚠️  Email delivery failed, but API key is below:');
    }
    
    // Always print API key for debugging (whether email succeeded or failed)
    console.log('');
    console.log('='.repeat(70));
    console.log('🔑 YOUR API KEY (COPY THIS):');
    console.log('='.repeat(70));
    console.log(apiKey);
    console.log('='.repeat(70));
    console.log('');
    console.log('📋 Usage:');
    console.log(`   curl -H "X-API-Key: ${apiKey}" https://sinna.site/health`);
    console.log(`   curl -H "X-API-Key: ${apiKey}" https://sinna.site/v1/me/subscription`);
    console.log('');
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.message.includes('DATABASE_URL')) {
      console.log('');
      console.log('💡 Tip: This script requires DATABASE_URL environment variable.');
      console.log('   On Render: Environment variables are automatically available.');
      console.log('   Locally: Set DATABASE_URL in your .env file or export it.');
    }
    process.exit(1);
  }
}

main().catch(console.error);

