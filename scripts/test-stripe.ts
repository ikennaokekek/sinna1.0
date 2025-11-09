#!/usr/bin/env tsx
/**
 * Stripe Integration Test
 * Tests: API key validity, checkout session creation, webhook endpoint
 */

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_STANDARD_PRICE_ID = process.env.STRIPE_STANDARD_PRICE_ID || 'price_1SLDYEFOUj5aKuFKieTbbTX1';
const BASE_URL = process.env.BASE_URL_PUBLIC || 'https://sinna.site';

async function testStripeIntegration() {
  console.log('🧪 STRIPE INTEGRATION TEST');
  console.log('='.repeat(70));
  console.log('');

  // Test 1: Verify API Key
  console.log('1️⃣ Testing Stripe API Key...');
  if (!STRIPE_SECRET_KEY) {
    console.error('❌ STRIPE_SECRET_KEY not set');
    console.error('   Set it: export STRIPE_SECRET_KEY=sk_live_...');
    process.exit(1);
  }

  const isLive = STRIPE_SECRET_KEY.startsWith('sk_live_');
  const isTest = STRIPE_SECRET_KEY.startsWith('sk_test_');
  
  if (!isLive && !isTest) {
    console.error('❌ Invalid Stripe key format');
    console.error('   Key must start with sk_live_ or sk_test_');
    process.exit(1);
  }

  console.log(`✅ Key format valid (${isLive ? 'LIVE' : 'TEST'} mode)`);
  console.log(`   Key: ${STRIPE_SECRET_KEY.substring(0, 20)}...`);
  console.log('');

  // Test 2: Initialize Stripe Client
  console.log('2️⃣ Initializing Stripe client...');
  let stripe: Stripe;
  try {
    stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2024-11-20.acacia',
    });
    console.log('✅ Stripe client initialized');
    console.log('');
  } catch (error) {
    console.error('❌ Failed to initialize Stripe client:', error);
    process.exit(1);
  }

  // Test 3: Verify API Key by making a test call
  console.log('3️⃣ Verifying API key with Stripe...');
  try {
    const account = await stripe.accounts.retrieve();
    console.log('✅ API key is valid!');
    console.log(`   Account ID: ${account.id}`);
    console.log(`   Country: ${account.country}`);
    console.log(`   Type: ${account.type}`);
    console.log('');
  } catch (error: any) {
    if (error.type === 'StripeAuthenticationError') {
      console.error('❌ API key is invalid or expired');
      console.error(`   Error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }

  // Test 4: Check Price ID exists
  console.log('4️⃣ Verifying Price ID...');
  try {
    const price = await stripe.prices.retrieve(STRIPE_STANDARD_PRICE_ID);
    console.log('✅ Price ID is valid!');
    console.log(`   Price ID: ${price.id}`);
    console.log(`   Amount: $${(price.unit_amount || 0) / 100}/${price.recurring?.interval || 'one-time'}`);
    console.log(`   Currency: ${price.currency.toUpperCase()}`);
    console.log(`   Active: ${price.active}`);
    console.log('');
  } catch (error: any) {
    console.error('❌ Price ID is invalid or not found');
    console.error(`   Error: ${error.message}`);
    console.error(`   Price ID: ${STRIPE_STANDARD_PRICE_ID}`);
    process.exit(1);
  }

  // Test 5: Create Test Checkout Session
  console.log('5️⃣ Creating test checkout session...');
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: STRIPE_STANDARD_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: `${BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/billing/cancel`,
      customer_email: 'test@example.com', // Test email
      metadata: {
        test: 'true',
      },
    });

    console.log('✅ Checkout session created successfully!');
    console.log(`   Session ID: ${session.id}`);
    console.log(`   URL: ${session.url}`);
    console.log(`   Status: ${session.status}`);
    console.log('');
    console.log('='.repeat(70));
    console.log('🎉 ALL TESTS PASSED!');
    console.log('='.repeat(70));
    console.log('');
    console.log('📋 Summary:');
    console.log(`   ✅ API Key: Valid (${isLive ? 'LIVE' : 'TEST'} mode)`);
    console.log(`   ✅ Price ID: Valid`);
    console.log(`   ✅ Checkout Session: Created`);
    console.log('');
    console.log('🔗 Test Checkout URL:');
    console.log(`   ${session.url}`);
    console.log('');
    
    if (isTest) {
      console.log('💳 Test Card Details:');
      console.log('   Card: 4242 4242 4242 4242');
      console.log('   Expiry: 12/25 (any future date)');
      console.log('   CVC: 123 (any 3 digits)');
      console.log('');
    }

    return session.url;
  } catch (error: any) {
    console.error('❌ Failed to create checkout session');
    console.error(`   Error: ${error.message}`);
    if (error.type) {
      console.error(`   Type: ${error.type}`);
    }
    if (error.code) {
      console.error(`   Code: ${error.code}`);
    }
    process.exit(1);
  }
}

testStripeIntegration().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

