#!/usr/bin/env tsx
/**
 * Test Payment Flow - Create checkout and test API key email delivery
 * 
 * This script creates a TEST checkout session so you can:
 * 1. Complete payment with test card (4242 4242 4242 4242)
 * 2. Trigger webhook → Creates tenant → Generates API key → Sends email
 * 
 * Usage:
 *   pnpm tsx scripts/test-payment-flow.ts <test-email>
 * 
 * Example:
 *   pnpm tsx scripts/test-payment-flow.ts test@example.com
 */

import Stripe from 'stripe';

const TEST_EMAIL = process.argv[2] || 'test@example.com';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_STANDARD_PRICE_ID = process.env.STRIPE_STANDARD_PRICE_ID || 'price_1SLDYEFOUj5aKuFKieTbbTX1';
const BASE_URL = process.env.BASE_URL_PUBLIC || 'https://sinna.site';

// Check if using test or live mode
const isTestMode = STRIPE_SECRET_KEY.startsWith('sk_test_');
const isLiveMode = STRIPE_SECRET_KEY.startsWith('sk_live_');

if (!STRIPE_SECRET_KEY) {
  console.error('❌ Error: STRIPE_SECRET_KEY environment variable is required');
  console.error('\n💡 For TESTING, use a test key (sk_test_...)');
  console.error('💡 Get it from: https://dashboard.stripe.com/test/apikeys');
  process.exit(1);
}

if (isLiveMode) {
  console.warn('⚠️  WARNING: You are using a LIVE Stripe key!');
  console.warn('⚠️  This will process REAL payments.');
  console.warn('⚠️  For testing, use a TEST key (sk_test_...)\n');
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.question('Continue with LIVE mode? (yes/no): ', (answer: string) => {
    rl.close();
    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ Cancelled. Use a test key for testing.');
      process.exit(1);
    }
    createCheckout();
  });
} else {
  createCheckout();
}

async function createCheckout() {
  console.log('\n🧪 TEST PAYMENT FLOW - API Key Email Delivery\n');
  console.log('='.repeat(70));
  console.log(`Mode: ${isTestMode ? 'TEST' : 'LIVE'}`);
  console.log(`Test Email: ${TEST_EMAIL}`);
  console.log(`Price ID: ${STRIPE_STANDARD_PRICE_ID}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log('='.repeat(70));
  console.log('\n📋 FLOW OVERVIEW:');
  console.log('   1. Create checkout session → Get checkout URL');
  console.log('   2. Complete payment → Use test card: 4242 4242 4242 4242');
  console.log('   3. Stripe sends webhook → checkout.session.completed');
  console.log('   4. API processes webhook → Creates tenant + API key');
  console.log('   5. Email sent → API key delivered to:', TEST_EMAIL);
  console.log('   6. Verify → Check email inbox and Render logs\n');
  
  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2024-11-20.acacia',
    });
    
    const expiresAt = Math.floor(Date.now() / 1000) + (35 * 60);
    
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: STRIPE_STANDARD_PRICE_ID, quantity: 1 }],
      success_url: `${BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/billing/cancel`,
      customer_email: TEST_EMAIL,
      expires_at: expiresAt,
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      metadata: {
        test: 'true',
        test_email: TEST_EMAIL,
      },
    });
    
    if (!session.url) {
      throw new Error('No checkout URL returned');
    }
    
    console.log('✅ CHECKOUT SESSION CREATED!\n');
    console.log('='.repeat(70));
    console.log('🔗 CHECKOUT URL (Open in browser):');
    console.log('='.repeat(70));
    console.log('\n' + session.url + '\n');
    console.log('='.repeat(70));
    console.log('\n📋 Session Details:');
    console.log(`   Session ID: ${session.id}`);
    console.log(`   Customer Email: ${TEST_EMAIL}`);
    console.log(`   Expires: ${new Date(expiresAt * 1000).toLocaleString()}`);
    
    if (isTestMode) {
      console.log('\n💳 TEST CARD DETAILS:');
      console.log('   Card Number: 4242 4242 4242 4242');
      console.log('   Expiry: 12/25 (any future date)');
      console.log('   CVC: 123 (any 3 digits)');
      console.log('   ZIP: 12345 (any 5 digits)');
    }
    
    console.log('\n📧 EMAIL FLOW:');
    console.log('   1. Complete payment above');
    console.log('   2. Stripe webhook sent to: https://sinna1-0.onrender.com/webhooks/stripe');
    console.log('   3. Webhook handler creates tenant and API key');
    console.log('   4. Email sent via sendApiKeyEmail() function');
    console.log('   5. Check inbox:', TEST_EMAIL);
    console.log('\n🔍 VERIFY EMAIL:');
    console.log('   - Check inbox:', TEST_EMAIL);
    console.log('   - Subject: "Your Sinna API Key is Ready! 🎉"');
    console.log('   - Contains: API key, base URL, usage instructions');
    console.log('\n📊 CHECK LOGS:');
    console.log('   - Render Dashboard → Logs tab');
    console.log('   - Search for: "API key email sent successfully"');
    console.log('   - Or: "checkout.session.completed"');
    console.log('\n✅ After payment, check your email!\n');
    
  } catch (error: any) {
    console.error('\n❌ Error creating checkout session:');
    console.error(error.message);
    if (error.type === 'StripeInvalidRequestError') {
      console.error('\n💡 Check that:');
      console.error('   - STRIPE_SECRET_KEY is valid');
      console.error('   - STRIPE_STANDARD_PRICE_ID exists in your Stripe account');
      console.error('   - For testing, use a TEST key (sk_test_...)');
    }
    process.exit(1);
  }
}

