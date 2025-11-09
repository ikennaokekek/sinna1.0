#!/usr/bin/env tsx
/**
 * Generate Stripe Checkout Link for LIVE account (client-facing)
 * Usage: tsx scripts/create-live-checkout.ts
 * 
 * This creates a checkout link that clients can use to subscribe.
 * The link can be shared directly with clients.
 */

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_LIVE_SECRET_KEY;
const STRIPE_STANDARD_PRICE_ID = process.env.STRIPE_STANDARD_PRICE_ID || process.env.STRIPE_LIVE_PRICE_ID;
const BASE_URL = process.env.BASE_URL || 'https://sinna.site';

if (!STRIPE_SECRET_KEY) {
  console.error('❌ Error: STRIPE_SECRET_KEY or STRIPE_LIVE_SECRET_KEY environment variable is required');
  console.error('\n💡 Set it in your environment:');
  console.error('   export STRIPE_SECRET_KEY=sk_live_...');
  process.exit(1);
}

if (!STRIPE_STANDARD_PRICE_ID) {
  console.error('❌ Error: STRIPE_STANDARD_PRICE_ID or STRIPE_LIVE_PRICE_ID environment variable is required');
  console.error('\n💡 Set it in your environment:');
  console.error('   export STRIPE_STANDARD_PRICE_ID=price_...');
  process.exit(1);
}

async function createLiveCheckout() {
  console.log('🔗 Creating LIVE Stripe Checkout Link for Clients\n');
  console.log('─'.repeat(70));
  
  const isLive = STRIPE_SECRET_KEY.startsWith('sk_live_');
  const mode = isLive ? 'LIVE' : 'TEST';
  
  console.log(`Mode: ${mode}`);
  console.log(`Price ID: ${STRIPE_STANDARD_PRICE_ID}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log('─'.repeat(70));
  console.log('');
  
  if (!isLive) {
    console.warn('⚠️  WARNING: Using TEST mode key. For production, use sk_live_...');
    console.log('');
  }
  
  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2024-11-20.acacia',
    });
    
    // Create checkout session with expiration (Stripe minimum is 30 minutes - no customer_email - clients will enter their own)
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
      expires_at: expiresAt, // Expires in 35 minutes
      // Don't set customer_email - let clients enter their own
      payment_method_types: ['card'],
      allow_promotion_codes: true, // Allow discount codes
      billing_address_collection: 'required', // Collect billing address
      metadata: {
        source: 'client_checkout',
        created_by: 'admin',
      },
    });
    
    if (!session.url) {
      throw new Error('No checkout URL returned from Stripe');
    }
    
    console.log('✅ Checkout session created successfully!\n');
    console.log('='.repeat(70));
    console.log('🔗 CLIENT CHECKOUT LINK (Share this with clients):');
    console.log('='.repeat(70));
    console.log(session.url);
    console.log('='.repeat(70));
    console.log('');
    console.log('📋 Session Details:');
    console.log(`   Session ID: ${session.id}`);
    console.log(`   Mode: ${mode}`);
    console.log(`   Price: $2,000/month`);
    console.log(`   Status: ${session.status}`);
    console.log(`   Expires at: ${new Date(expiresAt * 1000).toISOString()} (35 minutes from now)`);
    console.log('');
    console.log('📧 What happens:');
    console.log('   1. Client clicks link and enters their email');
    console.log('   2. Client enters payment details');
    console.log('   3. After successful payment:');
    console.log('      • Stripe sends webhook to Sinna API');
    console.log('      • System creates tenant + generates API key');
    console.log('      • API key emailed to client\'s email');
    console.log('');
    
    if (!isLive) {
      console.log('💳 TEST MODE - Use test card:');
      console.log('   Card: 4242 4242 4242 4242');
      console.log('   Expiry: 12/25 (any future date)');
      console.log('   CVC: 123 (any 3 digits)');
      console.log('');
    }
    
    // Also create a Payment Link (alternative method)
    try {
      const paymentLink = await stripe.paymentLinks.create({
        line_items: [
          {
            price: STRIPE_STANDARD_PRICE_ID,
            quantity: 1,
          },
        ],
        after_completion: {
          type: 'redirect',
          redirect: {
            url: `${BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
          },
        },
      });
      
      console.log('='.repeat(70));
      console.log('🔗 ALTERNATIVE: Stripe Payment Link (Also shareable):');
      console.log('='.repeat(70));
      console.log(paymentLink.url);
      console.log('='.repeat(70));
      console.log('');
    } catch (err) {
      console.log('ℹ️  Payment Link creation skipped (optional feature)');
    }
    
    return session.url;
  } catch (error) {
    console.error('\n❌ Failed to create checkout session:');
    if (error instanceof Stripe.errors.StripeError) {
      console.error(`   Stripe Error: ${error.message}`);
      console.error(`   Type: ${error.type}`);
      if (error.code) {
        console.error(`   Code: ${error.code}`);
      }
    } else {
      console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Verify STRIPE_SECRET_KEY is valid and not expired');
    console.error('   2. Verify STRIPE_STANDARD_PRICE_ID exists in your Stripe account');
    console.error('   3. Check Stripe Dashboard: https://dashboard.stripe.com/products');
    process.exit(1);
  }
}

createLiveCheckout().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

