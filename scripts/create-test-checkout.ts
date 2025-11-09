#!/usr/bin/env node
/**
 * Create Test Stripe Checkout Session
 * 
 * Creates a Stripe checkout session for testing without requiring API authentication
 */

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_STANDARD_PRICE_ID = process.env.STRIPE_STANDARD_PRICE_ID || 'price_1SLDYEFOUj5aKuFKieTbbTX1';
const BASE_URL = process.env.BASE_URL_PUBLIC || 'https://sinna.site';
const TEST_EMAIL = process.env.TEST_EMAIL || 'road2yaadi@gmail.com';

if (!STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY environment variable is required');
  process.exit(1);
}

async function createTestCheckout() {
  console.log('🔗 Creating test Stripe checkout session...');
  console.log(`📧 Email: ${TEST_EMAIL}`);
  console.log(`💰 Price ID: ${STRIPE_STANDARD_PRICE_ID}`);
  console.log(`🌐 Base URL: ${BASE_URL}\n`);

  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2024-11-20.acacia',
    });

    // Create checkout session with expiration (Stripe minimum is 30 minutes)
    // Using 35 minutes to account for clock skew and ensure it's definitely over the minimum
    const expiresAt = Math.floor(Date.now() / 1000) + (35 * 60); // 35 minutes from now
    
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
      customer_email: TEST_EMAIL,
      expires_at: expiresAt, // Expires in 5 minutes
      metadata: {
        test: 'true',
        email: TEST_EMAIL,
      },
      payment_method_types: ['card'],
      // Allow test mode
      ...(STRIPE_SECRET_KEY.startsWith('sk_test_') && {
        payment_method_types: ['card'],
      }),
    });

    console.log('✅ Checkout session created!\n');
    console.log('='.repeat(60));
    console.log('🔗 CHECKOUT URL:');
    console.log('='.repeat(60));
    console.log(session.url);
    console.log('='.repeat(60));
    console.log(`\n📋 Session ID: ${session.id}`);
    console.log(`📧 Customer Email: ${TEST_EMAIL}`);
    console.log(`💰 Amount: $2,000/month`);
    console.log(`⏰ Expires at: ${new Date(expiresAt * 1000).toISOString()} (35 minutes from now)`);
    console.log(`\n💡 Use Stripe test card: 4242 4242 4242 4242`);
    console.log(`💡 Card Expiry: Any future date`);
    console.log(`💡 CVC: Any 3 digits`);
    console.log(`\n✅ After payment, API key will be emailed to: ${TEST_EMAIL}`);

    return session.url;
  } catch (error) {
    console.error('❌ Failed to create checkout session:', error instanceof Error ? error.message : String(error));
    if (error instanceof Stripe.errors.StripeError) {
      console.error('Stripe Error:', error.message);
    }
    process.exit(1);
  }
}

createTestCheckout().catch(console.error);

