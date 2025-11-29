# 🧪 Stripe Payment Test Plan - API Key Email Delivery

**Date:** 2025-01-27  
**Purpose:** Test end-to-end Stripe payment flow and verify API key is sent to customer email

---

## 📋 Test Flow Overview

1. **Create Stripe Checkout Session** → Get checkout URL
2. **Complete Payment** → Use Stripe test card
3. **Stripe Sends Webhook** → `checkout.session.completed` event
4. **API Processes Webhook** → Creates tenant, generates API key
5. **Email Sent** → API key delivered to customer email
6. **Verify** → Check email inbox and database

---

## 🔍 Current Implementation

### Webhook Handler (`apps/api/src/routes/webhooks.ts`)
- ✅ Handles `checkout.session.completed` event
- ✅ Creates tenant and API key
- ✅ Stores API key in Redis for success page
- ✅ Calls `sendApiKeyEmail(email, apiKey)` (line 358-359)

### Email Function (`apps/api/src/utils/email.ts`)
- ✅ Uses `sendEmailNotice` from `lib/email.ts`
- ✅ Subject: "Your Sinna API Key is Ready! 🎉"
- ✅ Includes API key, base URL, usage instructions

### Email Service (`apps/api/src/lib/email.ts`)
- ✅ Tries Resend first (`RESEND_API_KEY`)
- ✅ Falls back to SendGrid (`SENDGRID_API_KEY`)
- ✅ From: `NOTIFY_FROM_EMAIL` (default: `noreply@sinna.site`)

---

## 🧪 Test Methods

### Method 1: Real Stripe Test Payment (Recommended)

**Steps:**
1. Create checkout session
2. Complete payment with test card
3. Stripe automatically sends webhook
4. Check email inbox

**Pros:**
- ✅ Tests real Stripe integration
- ✅ Tests webhook signature verification
- ✅ Most realistic test

**Cons:**
- ⚠️ Requires Stripe webhook endpoint to be accessible
- ⚠️ May take 1-2 minutes for webhook delivery

---

### Method 2: Simulate Webhook (Quick Test)

**Steps:**
1. Use test script to simulate webhook
2. Bypasses actual payment
3. Tests webhook handler directly

**Pros:**
- ✅ Fast (no payment needed)
- ✅ Good for testing webhook handler logic
- ✅ Can test multiple scenarios quickly

**Cons:**
- ⚠️ Doesn't test Stripe integration
- ⚠️ May bypass signature verification in test mode

---

## 🚀 Quick Test Script

I'll create a test script that:
1. Creates a test checkout session
2. Simulates the webhook event
3. Verifies email was sent
4. Checks database for tenant/API key

---

## ✅ Verification Checklist

After running test, verify:

- [ ] **Webhook Received**
  - Check Render logs for webhook processing
  - Look for: "checkout.session.completed" event

- [ ] **Tenant Created**
  - Check database: `SELECT * FROM tenants WHERE name = '<test_email>'`
  - Should have `active = true`, `status = 'active'`

- [ ] **API Key Generated**
  - Check database: `SELECT * FROM api_keys WHERE tenant_id = '<tenant_id>'`
  - Should have `key_hash` (hashed version)

- [ ] **Email Sent**
  - Check email inbox for test email
  - Subject: "Your Sinna API Key is Ready! 🎉"
  - Should contain API key (plain text)

- [ ] **API Key Works**
  - Test API endpoint with generated key
  - `curl -H "x-api-key: <api_key>" https://sinna1-0.onrender.com/health`

---

## 🔧 Environment Requirements

**Required Environment Variables:**
- `STRIPE_SECRET_KEY` - Stripe API key (test or live)
- `STRIPE_WEBHOOK_SECRET` - Webhook signing secret
- `RESEND_API_KEY` OR `SENDGRID_API_KEY` - Email service
- `NOTIFY_FROM_EMAIL` - From email address
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis connection (optional, for success page)

---

## 📊 Expected Results

**Successful Test Should Show:**
1. ✅ Checkout session created
2. ✅ Payment completed (or webhook simulated)
3. ✅ Webhook processed successfully
4. ✅ Tenant created in database
5. ✅ API key generated and stored
6. ✅ Email sent to customer
7. ✅ API key visible in email inbox

---

**Ready to test?** Let's run the test script!

