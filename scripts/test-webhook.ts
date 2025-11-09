#!/usr/bin/env tsx
/**
 * Test Stripe Webhook Endpoint
 * Simulates a checkout.session.completed event
 */

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://sinna.site/webhooks/stripe';
const TEST_EMAIL = process.argv[2] || 'test@example.com';

if (!STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY not set');
  process.exit(1);
}

if (!STRIPE_WEBHOOK_SECRET) {
  console.error('❌ STRIPE_WEBHOOK_SECRET not set');
  process.exit(1);
}

async function testWebhook() {
  console.log('🧪 Testing Stripe Webhook Endpoint');
  console.log('='.repeat(70));
  console.log(`Webhook URL: ${WEBHOOK_URL}`);
  console.log(`Test Email: ${TEST_EMAIL}`);
  console.log('');

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2024-11-20.acacia',
  });

  // Create a test checkout session
  console.log('1️⃣ Creating test checkout session...');
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [
      {
        price: process.env.STRIPE_STANDARD_PRICE_ID || 'price_1SLDYEFOUj5aKuFKieTbbTX1',
        quantity: 1,
      },
    ],
    success_url: `${process.env.BASE_URL || 'https://sinna.site'}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BASE_URL || 'https://sinna.site'}/billing/cancel`,
    customer_email: TEST_EMAIL,
    metadata: {
      test: 'true',
    },
  });

  console.log(`✅ Session created: ${session.id}`);
  console.log('');

  // Create webhook event payload
  console.log('2️⃣ Creating webhook event payload...');
  const event: Stripe.Event = {
    id: `evt_test_${Date.now()}`,
    object: 'event',
    api_version: '2024-11-20.acacia',
    created: Math.floor(Date.now() / 1000),
    livemode: STRIPE_SECRET_KEY.startsWith('sk_live_'),
    pending_webhooks: 1,
    request: null,
    type: 'checkout.session.completed',
    data: {
      object: session as any,
    },
  };

  // Sign the webhook
  console.log('3️⃣ Signing webhook...');
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: STRIPE_WEBHOOK_SECRET,
    timestamp,
    scheme: 'v1',
  });

  console.log(`✅ Signature generated`);
  console.log('');

  // Send webhook to endpoint
  console.log('4️⃣ Sending webhook to endpoint...');
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': signature,
      },
      body: payload,
    });

    const responseText = await response.text();
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Response: ${responseText}`);
    console.log('');

    if (response.ok) {
      console.log('✅ Webhook sent successfully!');
      console.log('');
      console.log('📋 Next steps:');
      console.log('   1. Check Render logs for webhook processing');
      console.log('   2. Verify tenant was created in database');
      console.log('   3. Verify API key was generated');
      console.log('   4. Check email inbox for API key');
    } else {
      console.error('❌ Webhook failed');
      console.error(`   Status: ${response.status}`);
      console.error(`   Response: ${responseText}`);
    }
  } catch (error) {
    console.error('❌ Failed to send webhook:', error);
  }
}

testWebhook().catch(console.error);

