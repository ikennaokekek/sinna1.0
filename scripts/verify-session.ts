#!/usr/bin/env tsx
/**
 * Verify Stripe Checkout Session
 * Checks if a session exists and is valid
 */

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const SESSION_ID = process.argv[2];

if (!STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY required');
  process.exit(1);
}

if (!SESSION_ID) {
  console.error('❌ Usage: tsx scripts/verify-session.ts <session_id>');
  process.exit(1);
}

async function verify() {
  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2024-11-20.acacia',
  });

  try {
    const session = await stripe.checkout.sessions.retrieve(SESSION_ID);
    
    console.log('');
    console.log('✅ Session Status:');
    console.log(`   ID: ${session.id}`);
    console.log(`   Status: ${session.status}`);
    console.log(`   Payment Status: ${session.payment_status}`);
    console.log(`   URL: ${session.url || 'N/A'}`);
    console.log(`   Expires At: ${session.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'N/A'}`);
    console.log(`   Customer Email: ${session.customer_details?.email || 'N/A'}`);
    console.log('');
    
    if (session.status === 'open' && session.url) {
      console.log('✅ Session is VALID and ready to use!');
      console.log('');
      console.log('🔗 Full URL:');
      console.log(session.url);
    } else if (session.status === 'expired') {
      console.log('❌ Session has EXPIRED');
    } else if (session.status === 'complete') {
      console.log('✅ Session is COMPLETE (payment already processed)');
    } else {
      console.log(`⚠️  Session status: ${session.status}`);
    }
  } catch (error: any) {
    if (error.code === 'resource_missing') {
      console.error('❌ Session not found');
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

verify();

