#!/usr/bin/env tsx
/**
 * Diagnose Email Issue - Check why API key email isn't being sent
 * 
 * This script checks:
 * 1. Email service configuration
 * 2. Webhook handler status
 * 3. Test email sending
 * 4. Check recent webhook logs
 */

import { sendEmailNotice } from '../apps/api/src/lib/email';

async function main() {
  console.log('\n🔍 DIAGNOSING EMAIL ISSUE\n');
  console.log('='.repeat(70));
  
  // Check 1: Email Service Configuration
  console.log('\n📋 CHECK 1: Email Service Configuration');
  console.log('-'.repeat(70));
  
  const resendKey = process.env.RESEND_API_KEY;
  const sendgridKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.NOTIFY_FROM_EMAIL || 'noreply@sinna.site';
  const enableHandler = process.env.ENABLE_RENDER_CHECKOUT_HANDLER;
  
  console.log(`RESEND_API_KEY: ${resendKey ? '✅ SET (' + resendKey.substring(0, 10) + '...)' : '❌ MISSING'}`);
  console.log(`SENDGRID_API_KEY: ${sendgridKey ? '✅ SET (' + sendgridKey.substring(0, 10) + '...)' : '❌ MISSING'}`);
  console.log(`NOTIFY_FROM_EMAIL: ${fromEmail}`);
  console.log(`ENABLE_RENDER_CHECKOUT_HANDLER: ${enableHandler || '❌ NOT SET'}`);
  
  if (!resendKey && !sendgridKey) {
    console.log('\n❌ PROBLEM: No email service configured!');
    console.log('💡 Add RESEND_API_KEY or SENDGRID_API_KEY to Render environment variables');
    process.exit(1);
  }
  
  if (enableHandler !== 'true') {
    console.log('\n⚠️  WARNING: ENABLE_RENDER_CHECKOUT_HANDLER is not set to "true"');
    console.log('💡 Set ENABLE_RENDER_CHECKOUT_HANDLER=true in Render environment variables');
  }
  
  // Check 2: Test Email Sending
  console.log('\n📋 CHECK 2: Test Email Sending');
  console.log('-'.repeat(70));
  
  const testEmail = process.argv[2] || 'ikennaokeke1996@gmail.com';
  console.log(`Testing email to: ${testEmail}`);
  
  try {
    console.log('Sending test email...');
    await sendEmailNotice(
      testEmail,
      'Test Email - API Key Delivery',
      'This is a test email to verify email service is working.\n\nIf you receive this, email service is configured correctly.'
    );
    console.log('✅ Test email sent successfully!');
    console.log(`📧 Check inbox: ${testEmail}`);
  } catch (error) {
    console.log('❌ Test email failed!');
    console.error('Error:', error instanceof Error ? error.message : String(error));
    console.log('\n💡 This means email service is not working. Check:');
    console.log('   1. API key is valid');
    console.log('   2. Email service account is active');
    console.log('   3. Domain is verified (for Resend)');
    console.log('   4. Check Render logs for detailed error');
  }
  
  // Check 3: Webhook Configuration
  console.log('\n📋 CHECK 3: Webhook Configuration');
  console.log('-'.repeat(70));
  
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  
  console.log(`STRIPE_SECRET_KEY: ${stripeSecretKey ? '✅ SET' : '❌ MISSING'}`);
  console.log(`STRIPE_WEBHOOK_SECRET: ${stripeWebhookSecret ? '✅ SET' : '❌ MISSING'}`);
  
  if (!stripeWebhookSecret) {
    console.log('\n⚠️  WARNING: STRIPE_WEBHOOK_SECRET not set');
    console.log('💡 Webhook signature verification may fail');
  }
  
  // Summary
  console.log('\n📋 SUMMARY');
  console.log('='.repeat(70));
  console.log('\n✅ If test email succeeded: Email service is working');
  console.log('❌ If test email failed: Fix email service configuration');
  console.log('\n🔍 Next Steps:');
  console.log('   1. Check Render logs for webhook events');
  console.log('   2. Search for: "checkout.session.completed"');
  console.log('   3. Search for: "API key email sent successfully"');
  console.log('   4. Search for: "Failed to send API key email"');
  console.log('   5. Search for: "API KEY FOR MANUAL RETRIEVAL"');
  console.log('\n📊 Render Logs:');
  console.log('   https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg → Logs');
  console.log('\n');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});

