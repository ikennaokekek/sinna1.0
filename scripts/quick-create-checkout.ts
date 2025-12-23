#!/usr/bin/env tsx
import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_STANDARD_PRICE_ID = process.env.STRIPE_STANDARD_PRICE_ID || 'price_1SLDYEFOUj5aKuFKieTbbTX1';
const BASE_URL = process.env.BASE_URL_PUBLIC || 'https://sinna.site';

if (!STRIPE_SECRET_KEY) {
  console.error('❌ Error: STRIPE_SECRET_KEY environment variable is required');
  console.error('\n💡 Set it:');
  console.error('   export STRIPE_SECRET_KEY="sk_live_..."');
  console.error('   export STRIPE_STANDARD_PRICE_ID="price_..."');
  console.error('\nOr get from Render:');
  console.error('   https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg → Environment');
  process.exit(1);
}

async function main() {
  try {
    // TypeScript: STRIPE_SECRET_KEY is guaranteed to be defined here due to check above
    const stripe = new Stripe(STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',
    });
    
    const expiresAt = Math.floor(Date.now() / 1000) + (35 * 60);
    
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: STRIPE_STANDARD_PRICE_ID, quantity: 1 }],
      success_url: `${BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/billing/cancel`,
      expires_at: expiresAt,
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      billing_address_collection: 'required',
    });
    
    if (!session.url) {
      throw new Error('No checkout URL returned');
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ CHECKOUT LINK CREATED!');
    console.log('='.repeat(70));
    console.log('\n' + session.url + '\n');
    console.log('='.repeat(70));
    console.log('\n📋 Session Details:');
    console.log(`   Session ID: ${session.id}`);
    console.log(`   Mode: LIVE`);
    console.log(`   Expires: ${new Date(expiresAt * 1000).toLocaleString()}`);
    console.log('\n💳 Share this link with clients to subscribe!\n');
    
  } catch (error: any) {
    console.error('\n❌ Error creating checkout session:');
    console.error(error.message);
    if (error.type === 'StripeInvalidRequestError') {
      console.error('\n💡 Check that:');
      console.error('   - STRIPE_SECRET_KEY is valid');
      console.error('   - STRIPE_STANDARD_PRICE_ID exists in your Stripe account');
    }
    process.exit(1);
  }
}

main();

