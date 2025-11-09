#!/usr/bin/env tsx
/**
 * DIAGNOSTIC: Check if Stripe webhook was received and processed
 * Run this on Render Shell to diagnose webhook issues
 */

import { getDb } from '../apps/api/src/lib/db';

const email = process.argv[2] || 'road2yaadi@gmail.com';

async function main() {
  console.log('🔍 WEBHOOK DIAGNOSTIC REPORT');
  console.log('='.repeat(70));
  console.log(`Email: ${email}\n`);
  
  try {
    const { pool } = getDb();
    
    // 1. Check tenant
    console.log('1️⃣ CHECKING TENANT...');
    const tenantResult = await pool.query(
      'SELECT id, name, active, plan, stripe_customer_id, stripe_subscription_id, created_at FROM tenants WHERE name = $1',
      [email]
    );
    
    if (tenantResult.rows.length === 0) {
      console.log('❌ RESULT: NO TENANT FOUND');
      console.log('\n📋 ANALYSIS:');
      console.log('   → Webhook was NOT received or NOT processed');
      console.log('   → Stripe checkout completed but webhook failed');
      console.log('\n💡 SOLUTIONS:');
      console.log('   1. Check Stripe Dashboard → Webhooks');
      console.log('      • Verify endpoint: https://sinna.site/webhooks/stripe');
      console.log('      • Check if checkout.session.completed event is enabled');
      console.log('   2. Check Render logs for webhook errors');
      console.log('   3. Verify STRIPE_WEBHOOK_SECRET matches Stripe webhook secret');
      console.log('   4. Re-send webhook from Stripe Dashboard');
      return;
    }
    
    const tenant = tenantResult.rows[0];
    console.log('✅ RESULT: TENANT FOUND');
    console.log(`   Tenant ID: ${tenant.id}`);
    console.log(`   Name: ${tenant.name}`);
    console.log(`   Active: ${tenant.active}`);
    console.log(`   Plan: ${tenant.plan}`);
    console.log(`   Created: ${tenant.created_at}`);
    console.log(`   Stripe Customer: ${tenant.stripe_customer_id || '❌ MISSING'}`);
    console.log(`   Stripe Subscription: ${tenant.stripe_subscription_id || '❌ MISSING'}\n`);
    
    // 2. Check API keys
    console.log('2️⃣ CHECKING API KEYS...');
    const keysResult = await pool.query(
      'SELECT key_hash, created_at FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenant.id]
    );
    
    if (keysResult.rows.length === 0) {
      console.log('❌ RESULT: NO API KEY FOUND');
      console.log('\n📋 ANALYSIS:');
      console.log('   → Webhook was received but API key creation failed');
      console.log('\n💡 SOLUTION:');
      console.log('   Run: pnpm tsx scripts/retrieve-api-key.ts ' + email);
    } else {
      console.log(`✅ RESULT: ${keysResult.rows.length} API KEY(S) FOUND`);
      keysResult.rows.forEach((key, idx) => {
        console.log(`   Key ${idx + 1}: ${key.key_hash.substring(0, 20)}... (created: ${key.created_at})`);
      });
      console.log('\n⚠️  NOTE: API keys are hashed - original cannot be retrieved');
      console.log('💡 SOLUTION: Run retrieve-api-key.ts to generate new key\n');
    }
    
    // 3. Check email service
    console.log('3️⃣ CHECKING EMAIL SERVICE...');
    const resendKey = process.env.RESEND_API_KEY;
    const sendgridKey = process.env.SENDGRID_API_KEY;
    
    if (resendKey) {
      console.log('✅ RESEND_API_KEY: Configured');
    } else {
      console.log('❌ RESEND_API_KEY: Missing');
    }
    
    if (sendgridKey) {
      console.log('✅ SENDGRID_API_KEY: Configured');
    } else {
      console.log('❌ SENDGRID_API_KEY: Missing');
    }
    
    if (!resendKey && !sendgridKey) {
      console.log('\n❌ RESULT: NO EMAIL SERVICE CONFIGURED');
      console.log('💡 SOLUTION: Add RESEND_API_KEY or SENDGRID_API_KEY to Render env vars\n');
    } else {
      console.log('\n✅ RESULT: EMAIL SERVICE CONFIGURED');
      console.log('   → Email might have failed to send');
      console.log('   → Check Render logs for email errors\n');
    }
    
    // Final summary
    console.log('='.repeat(70));
    console.log('📋 FINAL DIAGNOSIS:');
    console.log('='.repeat(70));
    
    if (tenantResult.rows.length > 0 && keysResult.rows.length > 0) {
      console.log('✅ Webhook WAS received and processed');
      console.log('✅ Tenant WAS created');
      console.log('✅ API key WAS created');
      
      if (resendKey || sendgridKey) {
        console.log('✅ Email service IS configured');
        console.log('\n❓ EMAIL NOT RECEIVED? Possible reasons:');
        console.log('   • Email went to spam folder');
        console.log('   • Email service API error (check Render logs)');
        console.log('   • Email service rate limit exceeded');
        console.log('   • Invalid email address');
        console.log('\n💡 ACTION: Run retrieve-api-key.ts to resend email');
      } else {
        console.log('❌ Email service NOT configured');
        console.log('\n💡 ACTION: Add email service keys to Render env vars');
      }
    } else if (tenantResult.rows.length > 0 && keysResult.rows.length === 0) {
      console.log('⚠️  Webhook WAS received but API key creation FAILED');
      console.log('💡 ACTION: Check Render logs for errors');
    } else {
      console.log('❌ Webhook was NOT received');
      console.log('💡 ACTION: Configure Stripe webhook endpoint');
    }
    
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
    console.error('\n💡 Check:');
    console.error('   • DATABASE_URL is set correctly');
    console.error('   • Database is accessible');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
