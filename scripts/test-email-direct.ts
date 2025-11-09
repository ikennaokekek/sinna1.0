#!/usr/bin/env tsx
/**
 * Direct Email Test Script
 * Tests email sending directly without webhook
 */

import { sendEmailNotice } from '../apps/api/src/lib/email';

const TEST_EMAIL = process.env.TEST_EMAIL || 'ikennaokeke1996@gmail.com';
const TEST_API_KEY = 'sk_test_direct_test_key_12345678901234567890';

async function main() {
  console.log('📧 Testing email delivery...');
  console.log(`To: ${TEST_EMAIL}`);
  console.log(`From: ${process.env.NOTIFY_FROM_EMAIL || 'donotreply@sinna.site'}`);
  console.log(`Resend Key: ${process.env.RESEND_API_KEY ? '✅ Present' : '❌ Missing'}`);
  console.log(`SendGrid Key: ${process.env.SENDGRID_API_KEY ? '✅ Present' : '❌ Missing'}`);
  console.log('');

  try {
    await sendEmailNotice(
      TEST_EMAIL,
      'Your Sinna API Key is Ready! 🎉',
      `Your API key: ${TEST_API_KEY}\n\nBase URL: ${process.env.BASE_URL_PUBLIC || 'https://sinna.site'}\n\nKeep this key secure and use it in the X-API-Key header for all requests.\n\nThis is a test email to verify delivery.`
    );
    console.log('✅ Email sent successfully!');
    console.log(`📬 Check your inbox: ${TEST_EMAIL}`);
  } catch (error) {
    console.error('❌ Email failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch(console.error);

