#!/usr/bin/env tsx
/**
 * Test Email Service - Verify email delivery works
 * Usage: tsx scripts/test-email-service.ts <email>
 */

import { sendEmailNotice } from '../apps/api/src/lib/email';

const email = process.argv[2] || 'ikennaokeke1996@gmail.com';

async function testEmail() {
  console.log('🧪 Testing Email Service');
  console.log('='.repeat(70));
  console.log(`Recipient: ${email}`);
  console.log(`From: ${process.env.NOTIFY_FROM_EMAIL || 'noreply@sinna.site'}`);
  console.log(`Resend Key: ${process.env.RESEND_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`SendGrid Key: ${process.env.SENDGRID_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log('='.repeat(70));
  console.log('');
  
  if (!process.env.RESEND_API_KEY && !process.env.SENDGRID_API_KEY) {
    console.error('❌ ERROR: No email service configured!');
    console.error('');
    console.error('💡 Solution:');
    console.error('   1. Go to Render Dashboard → sinna-api → Environment');
    console.error('   2. Add RESEND_API_KEY or SENDGRID_API_KEY');
    console.error('   3. Save and redeploy');
    process.exit(1);
  }
  
  try {
    console.log('📧 Sending test email...');
    await sendEmailNotice(
      email,
      '🧪 Sinna Email Service Test',
      `This is a test email from Sinna API.\n\nIf you receive this, your email service is working correctly!\n\nTime: ${new Date().toISOString()}\n\nYour API key emails will be sent from: ${process.env.NOTIFY_FROM_EMAIL || 'noreply@sinna.site'}`
    );
    
    console.log('');
    console.log('✅ Email sent successfully!');
    console.log('');
    console.log('📋 Next steps:');
    console.log('   1. Check your inbox: ' + email);
    console.log('   2. Check spam folder if not in inbox');
    console.log('   3. If email received → Email service is working!');
    console.log('   4. If no email → Check Render logs for detailed error');
    
  } catch (error) {
    console.error('');
    console.error('❌ Email failed to send!');
    console.error('');
    console.error('Error:', error instanceof Error ? error.message : String(error));
    console.error('');
    console.error('💡 Troubleshooting:');
    console.error('   1. Check Render logs for detailed error');
    console.error('   2. Verify RESEND_API_KEY or SENDGRID_API_KEY is valid');
    console.error('   3. Check email service dashboard for errors');
    console.error('   4. Verify NOTIFY_FROM_EMAIL domain is verified');
    process.exit(1);
  }
}

testEmail().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

