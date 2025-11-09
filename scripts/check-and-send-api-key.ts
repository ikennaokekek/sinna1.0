/**
 * Check if API key exists for email, create if missing, and send email
 * Usage: pnpm tsx scripts/check-and-send-api-key.ts ikennaokeke1996@gmail.com
 */

import { getDb } from '../apps/api/src/lib/db';
import { createApiKey } from '../apps/api/src/utils/keys';
import { sendApiKeyEmail } from '../apps/api/src/utils/email';
import { hashKey } from '../apps/api/src/utils/keys';

const EMAIL = process.argv[2] || 'ikennaokeke1996@gmail.com';

async function main() {
  console.log(`🔍 Checking for API key for: ${EMAIL}\n`);

  const { pool } = getDb();

  try {
    // Check if tenant exists
    const tenantResult = await pool.query(
      'SELECT id, name, active, status, expires_at FROM tenants WHERE name = $1',
      [EMAIL]
    );

    let tenantId: string;
    let apiKey: string;

    if (tenantResult.rows.length === 0) {
      console.log('📝 No tenant found, creating new tenant and API key...');
      
      // Create tenant
      const { apiKey: newKey, hashed } = createApiKey();
      apiKey = newKey;
      
      const insertResult = await pool.query(
        `INSERT INTO tenants (name, active, status, expires_at) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id`,
        [EMAIL, true, 'active', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)] // 30 days from now
      );
      
      tenantId = insertResult.rows[0].id;
      
      // Create API key
      await pool.query(
        'INSERT INTO api_keys (key_hash, tenant_id) VALUES ($1, $2)',
        [hashed, tenantId]
      );
      
      console.log('✅ Tenant and API key created');
    } else {
      tenantId = tenantResult.rows[0].id;
      console.log(`✅ Tenant found: ${tenantId}`);
      
      // Check if API key exists
      const keyResult = await pool.query(
        'SELECT key_hash FROM api_keys WHERE tenant_id = $1 LIMIT 1',
        [tenantId]
      );
      
      if (keyResult.rows.length === 0) {
        console.log('📝 No API key found, creating new API key...');
        const { apiKey: newKey, hashed } = createApiKey();
        apiKey = newKey;
        
        await pool.query(
          'INSERT INTO api_keys (key_hash, tenant_id) VALUES ($1, $2)',
          [hashed, tenantId]
        );
        
        console.log('✅ API key created');
      } else {
        console.log('⚠️  API key exists but we cannot retrieve the plain text (it\'s hashed)');
        console.log('📝 Creating a NEW API key and sending it...');
        
        const { apiKey: newKey, hashed } = createApiKey();
        apiKey = newKey;
        
        await pool.query(
          'INSERT INTO api_keys (key_hash, tenant_id) VALUES ($1, $2)',
          [hashed, tenantId]
        );
        
        console.log('✅ New API key created');
      }
    }

    // Update tenant to active if needed
    await pool.query(
      'UPDATE tenants SET active = $1, status = $2, expires_at = $3 WHERE id = $4',
      [true, 'active', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), tenantId]
    );

    console.log('\n📧 Sending API key email...');
    try {
      await sendApiKeyEmail(EMAIL, apiKey);
      console.log('✅ Email sent successfully!\n');
    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError instanceof Error ? emailError.message : String(emailError));
      console.log('\n🔑 YOUR API KEY (COPY THIS):');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(apiKey);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      process.exit(1);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔑 API KEY (also sent to email):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(apiKey);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ Done! Check your email inbox.');

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

