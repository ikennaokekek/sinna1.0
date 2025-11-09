#!/usr/bin/env node
/**
 * Create Stripe Checkout Session - Direct API Call
 * 
 * This script creates a Stripe checkout session using the Stripe API directly.
 * It will prompt for a Stripe secret key if not provided via environment variable.
 */

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function createCheckout() {
  console.log('🔗 Creating Stripe Checkout Session\n');
  
  // Get Stripe secret key
  let stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    stripeKey = await question('Enter your Stripe Secret Key (sk_live_... or sk_test_...): ');
  }
  
  if (!stripeKey || stripeKey.length < 10) {
    console.error('❌ Invalid Stripe secret key');
    process.exit(1);
  }
  
  const priceId = process.env.STRIPE_STANDARD_PRICE_ID || 'price_1SLDYEFOUj5aKuFKieTbbTX1';
  const email = process.env.TEST_EMAIL || 'road2yaadi@gmail.com';
  const baseUrl = process.env.BASE_URL || 'https://sinna.site';
  
  console.log(`\n📧 Customer Email: ${email}`);
  console.log(`💰 Price ID: ${priceId}`);
  console.log(`🌐 Base URL: ${baseUrl}\n`);
  
  try {
    // Use fetch to call Stripe API
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'subscription',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'success_url': `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        'cancel_url': `${baseUrl}/billing/cancel`,
        'customer_email': email,
        'metadata[test]': 'true',
      }).toString(),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || `Stripe API error: ${response.status}`);
    }
    
    if (!data.url) {
      throw new Error('No checkout URL returned from Stripe');
    }
    
    console.log('✅ Checkout session created successfully!\n');
    console.log('='.repeat(70));
    console.log('🔗 YOUR STRIPE CHECKOUT LINK:');
    console.log('='.repeat(70));
    console.log(data.url);
    console.log('='.repeat(70));
    console.log(`\n📋 Session ID: ${data.id}`);
    console.log(`📧 Customer Email: ${email}`);
    console.log(`💰 Amount: $2,000/month`);
    console.log(`\n💡 TEST CARD DETAILS:`);
    console.log(`   Card Number: 4242 4242 4242 4242`);
    console.log(`   Expiry: Any future date (e.g., 12/25)`);
    console.log(`   CVC: Any 3 digits (e.g., 123)`);
    console.log(`   ZIP: Any 5 digits (e.g., 12345)`);
    console.log(`\n✅ After payment, API key will be emailed to: ${email}`);
    console.log(`\n📄 You can then use this API key to run production verification tests.`);
    
    return data.url;
  } catch (error) {
    console.error('\n❌ Failed to create checkout session:', error.message);
    if (error.message.includes('expired') || error.message.includes('401')) {
      console.error('\n💡 Your Stripe secret key appears to be expired or invalid.');
      console.error('💡 Get a new key from: https://dashboard.stripe.com/apikeys');
      console.error('\n💡 Or create checkout manually:');
      console.error('   1. Go to: https://dashboard.stripe.com/test/checkout');
      console.error('   2. Click "Create checkout session"');
      console.error('   3. Use the settings shown above');
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

createCheckout().catch(console.error);

