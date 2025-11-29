#!/usr/bin/env tsx
/**
 * Quick Stripe Checkout Link Generator
 * Usage: pnpm tsx scripts/quick-checkout.ts
 * 
 * This will prompt for Stripe credentials and generate a checkout link immediately
 */

import Stripe from 'stripe';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('\n🔗 Quick Stripe Checkout Link Generator\n');
  console.log('='.repeat(70));
  
  // Get Stripe credentials
  const stripeKey = process.env.STRIPE_SECRET_KEY || await question('Enter STRIPE_SECRET_KEY (or press Enter to use env): ');
  const priceId = process.env.STRIPE_STANDARD_PRICE_ID || await question('Enter STRIPE_STANDARD_PRICE_ID (or press Enter to use env): ');
  const baseUrl = process.env.BASE_URL_PUBLIC || 'https://sinna.site';
  
  if (!stripeKey || !priceId) {
    console.error('\n❌ Error: STRIPE_SECRET_KEY and STRIPE_STANDARD_PRICE_ID are required');
    console.error('\n💡 Get them from Render Dashboard:');
    console.error('   https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg → Environment tab');
    rl.close();
    process.exit(1);
  }
  
  try {
    const stripe = new Stripe(stripeKey, {
      apiVersion: '2024-11-20.acacia',
    });
    
    console.log('\n🚀 Creating checkout session...\n');
    
    const expiresAt = Math.floor(Date.now() / 1000) + (35 * 60);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/billing/cancel`,
      expires_at: expiresAt,
      payment_method_types: ['card'],
      allow_promotion_codes: true,
    });
    
    if (!session.url) {
      throw new Error('No checkout URL returned');
    }
    
    console.log('='.repeat(70));
    console.log('✅ CHECKOUT LINK CREATED!');
    console.log('='.repeat(70));
    console.log('\n' + session.url + '\n');
    console.log('='.repeat(70));
    console.log('\n📋 Session Details:');
    console.log(`   Session ID: ${session.id}`);
    console.log(`   Mode: ${stripeKey.startsWith('sk_live_') ? 'LIVE' : 'TEST'}`);
    console.log(`   Expires: ${new Date(expiresAt * 1000).toLocaleString()}`);
    console.log('\n💳 Test Card (if TEST mode):');
    console.log('   Card: 4242 4242 4242 4242');
    console.log('   Expiry: 12/25');
    console.log('   CVC: 123');
    console.log('\n📧 After payment, check email for API key!\n');
    
  } catch (error) {
    console.error('\n❌ Error creating checkout session:');
    if (error instanceof Stripe.errors.StripeError) {
      console.error(`   ${error.message}`);
    } else {
      console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

main().catch(console.error);
