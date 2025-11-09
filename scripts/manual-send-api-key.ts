#!/usr/bin/env tsx
/**
 * Manual API Key Email Sender
 * Sends API key email directly without webhook
 */

import { sendEmailNotice } from '../apps/api/src/lib/email';
import { getDb, seedTenantAndApiKey } from '../apps/api/src/lib/db';

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
        const crypto = await import('crypto');
        const randomBytes = crypto.randomBytes(24);
        const randomString = randomBytes.toString('base64')
          .replace(/[+/=]/g, '')
          .toLowerCase()
          .substring(0, 32);
        apiKey = `sk_live_${randomString}`;
        const hashed = crypto.createHash('sha256').update(apiKey).digest('hex');
        
        await pool.query(
          'INSERT INTO api_keys (tenant_id, key_hash) VALUES ($1, $2)',
          [tenantId, hashed]
        );
        console.log('✅ New API key generated');
      } else {
        // No API key, generate one
        const crypto = await import('crypto');
        const randomBytes = crypto.randomBytes(24);
        const randomString = randomBytes.toString('base64')
          .replace(/[+/=]/g, '')
          .toLowerCase()
          .substring(0, 32);
        apiKey = `sk_live_${randomString}`;
        const hashed = crypto.createHash('sha256').update(apiKey).digest('hex');
        
        await pool.query(
          'INSERT INTO api_keys (tenant_id, key_hash) VALUES ($1, $2)',
          [tenantId, hashed]
        );
        console.log('✅ API key generated');
      }
    } else {
      // Create new tenant and API key
      console.log('📝 Creating new tenant...');
      const crypto = await import('crypto');
      const randomBytes = crypto.randomBytes(24);
      const randomString = randomBytes.toString('base64')
        .replace(/[+/=]/g, '')
        .toLowerCase()
        .substring(0, 32);
      apiKey = `sk_live_${randomString}`;
      const hashed = crypto.createHash('sha256').update(apiKey).digest('hex');

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
      await sendEmailNotice(
        EMAIL,
        'Your Sinna API Key is Ready! 🎉',
        `Your API key: ${apiKey}\n\nBase URL: ${process.env.BASE_URL_PUBLIC || 'https://sinna.site'}\n\nKeep this key secure and use it in the X-API-Key header for all requests.`
      );
      console.log('✅ Email sent successfully!');
      console.log(`📬 Check your inbox: ${EMAIL}`);
      console.log('');
      console.log('🔑 Your API Key (also in email):');
      console.log(apiKey);
    } catch (emailError) {
      console.error('❌ Email failed:', emailError instanceof Error ? emailError.message : String(emailError));
      console.log('');
      console.log('🔑 YOUR API KEY (email failed, but here it is):');
      console.log('');
      console.log(apiKey);
      console.log('');
      console.log('⚠️  Please save this key - email delivery failed!');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch(console.error);

