/**
 * Create a Stripe test checkout session for API key testing
 * Usage: pnpm tsx scripts/create-test-checkout-now.ts
 */

import Stripe from 'stripe';
import 'dotenv/config';

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.error('❌ STRIPE_SECRET_KEY not found in environment');
  process.exit(1);
}

const stripe = new Stripe(stripeKey, {
  apiVersion: '2024-12-18.acacia',
});

const BASE_URL = process.env.BASE_URL_PUBLIC || 'https://sinna.site';
const PRICE_ID = process.env.STRIPE_STANDARD_PRICE_ID;

if (!PRICE_ID) {
  console.error('❌ STRIPE_STANDARD_PRICE_ID not found in environment');
  process.exit(1);
}

async function createTestCheckout() {
  try {
    console.log('🔗 Creating Stripe test checkout session...');
    console.log(`📧 Customer email: ikennaokeke1996@gmail.com`);
    console.log(`💰 Price ID: ${PRICE_ID}`);
    console.log(`🌐 Base URL: ${BASE_URL}\n`);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: PRICE_ID,
          quantity: 1,
        },
      ],
      customer_email: 'ikennaokeke1996@gmail.com',
      success_url: `${BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/billing/cancel`,
      metadata: {
        test: 'true',
        created_by: 'test_checkout_script',
      },
      // Set expiration to 35 minutes (Stripe minimum is 30 minutes)
      expires_at: Math.floor(Date.now() / 1000) + (35 * 60),
    });

    console.log('✅ Checkout session created!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔗 CHECKOUT URL:');
    console.log(session.url);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📋 Session Details:');
    console.log(`   Session ID: ${session.id}`);
    console.log(`   Customer Email: ${session.customer_email || 'Will be set during checkout'}`);
    console.log(`   Expires At: ${session.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'N/A'}`);
    console.log(`   Status: ${session.status}`);
    console.log('\n💡 Next Steps:');
    console.log('   1. Open the checkout URL above');
    console.log('   2. Complete the payment with a test card');
    console.log('   3. Check ikennaokeke1996@gmail.com for your API key');
    console.log('   4. The API key will also be logged in Render logs if email fails\n');

    return session.url;
  } catch (error) {
    console.error('❌ Failed to create checkout session:', error);
    if (error instanceof Stripe.errors.StripeError) {
      console.error(`   Error type: ${error.type}`);
      console.error(`   Error message: ${error.message}`);
    }
    process.exit(1);
  }
}

createTestCheckout();

