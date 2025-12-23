#!/usr/bin/env tsx
import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_STANDARD_PRICE_ID = process.env.STRIPE_STANDARD_PRICE_ID || 'price_1SLDYEFOUj5aKuFKieTbbTX1';
const TEST_EMAIL = process.env.TEST_EMAIL || 'ikennaokeke1996@gmail.com';
const BASE_URL = process.env.BASE_URL_PUBLIC || 'https://sinna.site';

if (!STRIPE_SECRET_KEY) {
  console.error('❌ Error: STRIPE_SECRET_KEY environment variable is required');
  console.error('\n💡 Set it:');
  console.error('   export STRIPE_SECRET_KEY="sk_test_..." (for testing)');
  console.error('   export STRIPE_SECRET_KEY="sk_live_..." (for production)');
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
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ TEST CHECKOUT SESSION CREATED!');
    console.log('='.repeat(70));
    console.log('\n🔗 CHECKOUT URL (Open in browser):');
    console.log('\n' + session.url + '\n');
    console.log('='.repeat(70));
    console.log('\n📋 Session Details:');
    console.log(`   Session ID: ${session.id}`);
    console.log(`   Mode: TEST`);
    console.log(`   Customer Email: ${TEST_EMAIL}`);
    console.log(`   Expires: ${new Date(expiresAt * 1000).toLocaleString()}`);
    console.log('\n💳 TEST CARD DETAILS:');
    console.log('   Card Number: 4242 4242 4242 4242');
    console.log('   Expiry: 12/25 (any future date)');
    console.log('   CVC: 123 (any 3 digits)');
    console.log('   ZIP: 12345 (any 5 digits)');
    console.log('\n📧 EMAIL FLOW AFTER PAYMENT:');
    console.log('   1. Complete payment with test card above');
    console.log('   2. Stripe sends webhook → checkout.session.completed');
    console.log('   3. Webhook URL: https://sinna1-0.onrender.com/webhooks/stripe');
    console.log('   4. API creates tenant + generates API key');
    console.log('   5. Email sent to:', TEST_EMAIL);
    console.log('   6. Subject: "Your Sinna API Key is Ready! 🎉"');
    console.log('\n🔍 VERIFY EMAIL:');
    console.log('   - Check inbox:', TEST_EMAIL);
    console.log('   - Check Render logs: https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg → Logs');
    console.log('   - Search for: "API key email sent successfully"');
    console.log('\n✅ Ready to test! Complete payment above and check your email!\n');
    
  } catch (error: any) {
    console.error('\n❌ Error creating checkout session:');
    console.error(error.message);
    if (error.type === 'StripeInvalidRequestError') {
      console.error('\n💡 Check that:');
      console.error('   - STRIPE_SECRET_KEY is valid');
      console.error('   - STRIPE_STANDARD_PRICE_ID exists in your Stripe TEST account');
    }
    process.exit(1);
  }
}

main();
