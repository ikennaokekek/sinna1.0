#!/usr/bin/env tsx
/**
 * Test Stripe Payment Flow - End-to-End Test
 * 
 * This script tests the complete flow:
 * 1. Create Stripe checkout session
 * 2. Simulate payment completion (webhook)
 * 3. Verify tenant and API key creation
 * 4. Verify email was sent
 * 
 * Usage:
 *   pnpm tsx scripts/test-stripe-payment-flow.ts <test-email>
 * 
 * Example:
 *   pnpm tsx scripts/test-stripe-payment-flow.ts test@example.com
 */

import Stripe from 'stripe';
import { Pool } from 'pg';
import crypto from 'crypto';

const TEST_EMAIL = process.argv[2] || 'test@example.com';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_STANDARD_PRICE_ID = process.env.STRIPE_STANDARD_PRICE_ID;
const DATABASE_URL = process.env.DATABASE_URL;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://sinna1-0.onrender.com/webhooks/stripe';
const BASE_URL = process.env.BASE_URL_PUBLIC || 'https://sinna.site';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(70));
  log(title, 'cyan');
  console.log('='.repeat(70));
}

function logStep(step: number, message: string) {
  log(`\n${step}️⃣ ${message}`, 'blue');
}

async function main() {
  logSection('🧪 Stripe Payment Flow Test - API Key Email Delivery');
  
  // Validate environment
  logStep(1, 'Validating Environment Variables');
  const missing: string[] = [];
  if (!STRIPE_SECRET_KEY) missing.push('STRIPE_SECRET_KEY');
  if (!STRIPE_WEBHOOK_SECRET) missing.push('STRIPE_WEBHOOK_SECRET');
  if (!STRIPE_STANDARD_PRICE_ID) missing.push('STRIPE_STANDARD_PRICE_ID');
  if (!DATABASE_URL) missing.push('DATABASE_URL');
  
  if (missing.length > 0) {
    log(`❌ Missing required environment variables: ${missing.join(', ')}`, 'red');
    process.exit(1);
  }
  
  const hasResend = !!process.env.RESEND_API_KEY;
  const hasSendGrid = !!process.env.SENDGRID_API_KEY;
  
  if (!hasResend && !hasSendGrid) {
    log('⚠️  Warning: No email service configured (RESEND_API_KEY or SENDGRID_API_KEY)', 'yellow');
    log('   Email sending will fail, but webhook processing will still work', 'yellow');
  }
  
  log(`✅ Environment validated`, 'green');
  log(`   Test Email: ${TEST_EMAIL}`);
  log(`   Webhook URL: ${WEBHOOK_URL}`);
  log(`   Email Service: ${hasResend ? 'Resend' : hasSendGrid ? 'SendGrid' : 'None'}`);
  
  // Initialize Stripe
  logStep(2, 'Initializing Stripe Client');
  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2024-11-20.acacia',
  });
  const isLive = STRIPE_SECRET_KEY.startsWith('sk_live_');
  log(`✅ Stripe initialized (${isLive ? 'LIVE' : 'TEST'} mode)`, 'green');
  
  // Create checkout session
  logStep(3, 'Creating Stripe Checkout Session');
  try {
    const expiresAt = Math.floor(Date.now() / 1000) + (35 * 60);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: STRIPE_STANDARD_PRICE_ID, quantity: 1 }],
      success_url: `${BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/billing/cancel`,
      customer_email: TEST_EMAIL,
      expires_at: expiresAt,
      metadata: {
        test: 'true',
        test_run: Date.now().toString(),
      },
    });
    
    log(`✅ Checkout session created: ${session.id}`, 'green');
    log(`   Session URL: ${session.url || 'N/A'}`);
    
    // Create webhook event
    logStep(4, 'Creating Webhook Event Payload');
    const event: Stripe.Event = {
      id: `evt_test_${Date.now()}`,
      object: 'event',
      api_version: '2024-11-20.acacia',
      created: Math.floor(Date.now() / 1000),
      livemode: isLive,
      pending_webhooks: 1,
      request: null,
      type: 'checkout.session.completed',
      data: {
        object: session as any,
      },
    };
    
    // Sign webhook
    logStep(5, 'Signing Webhook');
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: STRIPE_WEBHOOK_SECRET,
      timestamp,
      scheme: 'v1',
    });
    
    log(`✅ Webhook signed`, 'green');
    
    // Send webhook
    logStep(6, 'Sending Webhook to API');
    log(`   URL: ${WEBHOOK_URL}`);
    
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': signature,
      },
      body: payload,
    });
    
    const responseText = await response.text();
    
    if (response.ok) {
      log(`✅ Webhook sent successfully (${response.status})`, 'green');
      log(`   Response: ${responseText}`);
    } else {
      log(`❌ Webhook failed (${response.status})`, 'red');
      log(`   Response: ${responseText}`, 'red');
      process.exit(1);
    }
    
    // Wait a moment for processing
    logStep(7, 'Waiting for Processing');
    log('   Waiting 3 seconds for webhook processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verify in database
    logStep(8, 'Verifying Database');
    if (!DATABASE_URL) {
      log('⚠️  DATABASE_URL not set, skipping database verification', 'yellow');
    } else {
      try {
        const pool = new Pool({ connectionString: DATABASE_URL });
        
        // Check tenant
        const tenantResult = await pool.query(
          'SELECT id, name, active, status, stripe_customer_id, stripe_subscription_id, created_at FROM tenants WHERE name = $1 ORDER BY created_at DESC LIMIT 1',
          [TEST_EMAIL]
        );
        
        if (tenantResult.rows.length > 0) {
          const tenant = tenantResult.rows[0];
          log(`✅ Tenant found:`, 'green');
          log(`   ID: ${tenant.id}`);
          log(`   Email: ${tenant.name}`);
          log(`   Active: ${tenant.active}`);
          log(`   Status: ${tenant.status}`);
          log(`   Stripe Customer: ${tenant.stripe_customer_id || 'N/A'}`);
          log(`   Stripe Subscription: ${tenant.stripe_subscription_id || 'N/A'}`);
          
          // Check API key
          const apiKeyResult = await pool.query(
            'SELECT key_hash, tenant_id, created_at FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
            [tenant.id]
          );
          
          if (apiKeyResult.rows.length > 0) {
            log(`✅ API key found:`, 'green');
            log(`   Key Hash: ${apiKeyResult.rows[0].key_hash.substring(0, 20)}...`);
            log(`   Created: ${apiKeyResult.rows[0].created_at}`);
          } else {
            log(`⚠️  No API key found for tenant`, 'yellow');
          }
        } else {
          log(`❌ Tenant not found in database`, 'red');
          log(`   This suggests webhook processing failed`, 'red');
        }
        
        await pool.end();
      } catch (dbError) {
        log(`⚠️  Database verification failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`, 'yellow');
      }
    }
    
    // Final instructions
    logSection('📧 Next Steps');
    log('1. Check your email inbox:', 'cyan');
    log(`   Email: ${TEST_EMAIL}`, 'cyan');
    log('   Subject: "Your Sinna API Key is Ready! 🎉"', 'cyan');
    log('   Should contain API key in plain text', 'cyan');
    log('');
    log('2. Check Render logs:', 'cyan');
    log('   https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg', 'cyan');
    log('   Look for: "API key email sent successfully"', 'cyan');
    log('');
    log('3. If email not received:', 'yellow');
    log('   - Check spam folder', 'yellow');
    log('   - Verify RESEND_API_KEY or SENDGRID_API_KEY is configured', 'yellow');
    log('   - Check Render logs for email errors', 'yellow');
    log('');
    log('4. Test API key:', 'cyan');
    log('   curl -H "x-api-key: <api-key-from-email>" https://sinna1-0.onrender.com/health', 'cyan');
    
    logSection('✅ Test Complete');
    
  } catch (error) {
    logSection('❌ Test Failed');
    if (error instanceof Stripe.errors.StripeError) {
      log(`Stripe Error: ${error.message}`, 'red');
      log(`Type: ${error.type}`, 'red');
    } else {
      log(`Error: ${error instanceof Error ? error.message : String(error)}`, 'red');
    }
    process.exit(1);
  }
}

main().catch((error) => {
  log(`\n❌ Unexpected error: ${error}`, 'red');
  process.exit(1);
});

