#!/usr/bin/env tsx
/**
 * Quick Checkout Link Generator
 * Outputs just the URL for easy copying
 */

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_STANDARD_PRICE_ID = process.env.STRIPE_STANDARD_PRICE_ID || process.env.STRIPE_STANDARD_PRICE_ID || 'price_1SLjdZFOUj5aKuFKFpV2ANpe';
const BASE_URL = process.env.BASE_URL || 'https://sinna.site';
const TEST_EMAIL = process.env.TEST_EMAIL || 'ikennaokeke1996@gmail.com';

if (!STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY required');
  process.exit(1);
}

async function main() {
  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2024-11-20.acacia',
  });

  const expiresAt = Math.floor(Date.now() / 1000) + (35 * 60); // 35 minutes

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: STRIPE_STANDARD_PRICE_ID, quantity: 1 }],
    success_url: `${BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${BASE_URL}/billing/cancel`,
    customer_email: TEST_EMAIL,
    expires_at: expiresAt,
    metadata: { test: 'true', email: TEST_EMAIL },
    payment_method_types: ['card'],
  });

  if (!session.url) {
    console.error('❌ No URL returned');
    process.exit(1);
  }

  // Output clean URL for easy copying
  console.log('');
  console.log('🔗 CHECKOUT URL (Copy this entire line):');
  console.log('');
  console.log(session.url);
  console.log('');
  console.log(`📋 Session ID: ${session.id}`);
  console.log(`⏰ Expires: ${new Date(expiresAt * 1000).toISOString()}`);
  console.log(`💳 Test Card: 4242 4242 4242 4242`);
  console.log('');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

