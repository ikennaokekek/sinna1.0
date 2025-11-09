#!/usr/bin/env tsx
/**
 * Create a Stripe Checkout Session for client testing
 * This simulates what a real client would use
 */

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_LIVE_SECRET_KEY;
const STRIPE_STANDARD_PRICE_ID = process.env.STRIPE_STANDARD_PRICE_ID || 'price_1SLDYEFOUj5aKuFKieTbbTX1';
const BASE_URL = process.env.BASE_URL_PUBLIC || 'https://sinna.site';

if (!STRIPE_SECRET_KEY) {
  console.error('');
  console.error('❌ STRIPE_SECRET_KEY required');
  console.error('');
  console.error('💡 Set it in your environment:');
  console.error('   export STRIPE_SECRET_KEY=sk_live_...');
  console.error('');
  console.error('   Or run:');
  console.error('   STRIPE_SECRET_KEY=sk_live_... pnpm tsx scripts/create-test-checkout-client.ts');
  console.error('');
  process.exit(1);
}

async function createCheckout() {
  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2024-11-20.acacia',
  });

  try {
    // Stripe minimum is 30 minutes, using 35 to account for clock skew
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
      expires_at: expiresAt,
      // Allow customer to enter their own email
      customer_email: undefined,
    });

    console.log('');
    console.log('✅ Checkout Session Created!');
    console.log('');
    console.log('='.repeat(70));
    console.log('🔗 YOUR TEST CHECKOUT LINK:');
    console.log('='.repeat(70));
    console.log(session.url);
    console.log('='.repeat(70));
    console.log('');
    console.log('📋 Test Instructions:');
    console.log('   1. Click the link above');
    console.log('   2. Enter your email (e.g., ikennaokeke1996@gmail.com)');
    console.log('   3. Use test card: 4242 4242 4242 4242');
    console.log('   4. Any future expiry date (e.g., 12/25)');
    console.log('   5. Any CVC (e.g., 123)');
    console.log('   6. Complete payment');
    console.log('   7. You\'ll be redirected to /billing/success');
    console.log('   8. Check your email for the API key');
    console.log('');
    console.log('⏰ Link expires in 35 minutes');
    console.log('');

    return session.url;
  } catch (error: any) {
    console.error('');
    console.error('❌ Failed to create checkout session:', error.message);
    if (error.code) {
      console.error(`   Code: ${error.code}`);
    }
    if (error.type) {
      console.error(`   Type: ${error.type}`);
    }
    console.error('');
    process.exit(1);
  }
}

createCheckout();

