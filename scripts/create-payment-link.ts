#!/usr/bin/env tsx
/**
 * Create Stripe Payment Link (Shorter, more reliable than checkout sessions)
 * Payment Links don't expire and are easier to share
 */

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_LIVE_SECRET_KEY;
const STRIPE_STANDARD_PRICE_ID = process.env.STRIPE_STANDARD_PRICE_ID || process.env.STRIPE_LIVE_PRICE_ID;
const BASE_URL = process.env.BASE_URL || 'https://sinna.site';

if (!STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY required');
  process.exit(1);
}

if (!STRIPE_STANDARD_PRICE_ID) {
  console.error('❌ STRIPE_STANDARD_PRICE_ID required');
  process.exit(1);
}

async function createPaymentLink() {
  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2024-11-20.acacia',
  });

  try {
    // Create Payment Link (shorter URL, doesn't expire)
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

    console.log('');
    console.log('✅ Payment Link Created!');
    console.log('');
    console.log('='.repeat(70));
    console.log('🔗 PAYMENT LINK (Short URL - Easy to share):');
    console.log('='.repeat(70));
    console.log(paymentLink.url);
    console.log('='.repeat(70));
    console.log('');
    console.log('📋 Details:');
    console.log(`   Link ID: ${paymentLink.id}`);
    console.log(`   Price: $2,000/month`);
    console.log(`   Status: ${paymentLink.active ? 'Active' : 'Inactive'}`);
    console.log(`   Expires: Never (Payment Links don't expire)`);
    console.log('');
    console.log('💡 Advantages:');
    console.log('   ✅ Shorter URL (easier to copy/share)');
    console.log('   ✅ Never expires');
    console.log('   ✅ Can be reused multiple times');
    console.log('   ✅ Works the same as checkout sessions');
    console.log('');

    return paymentLink.url;
  } catch (error: any) {
    console.error('❌ Failed to create payment link:', error.message);
    if (error.code) {
      console.error(`   Code: ${error.code}`);
    }
    process.exit(1);
  }
}

createPaymentLink();

