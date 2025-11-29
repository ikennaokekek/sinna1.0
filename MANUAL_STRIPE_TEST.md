# 🧪 Manual Stripe Payment Test - Step-by-Step

**Goal:** Test that API key is sent to customer email after Stripe payment

---

## 📋 Prerequisites

Before starting, ensure you have:

- ✅ Stripe account with API keys configured
- ✅ Email service configured (Resend or SendGrid)
- ✅ Render service running and accessible
- ✅ Database accessible

---

## 🚀 Step-by-Step Test Process

### Step 1: Set Up Environment Variables

**Option A: Use Render Environment Variables**

Get these from Render dashboard:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_STANDARD_PRICE_ID`
- `DATABASE_URL`
- `RESEND_API_KEY` (or `SENDGRID_API_KEY`)
- `NOTIFY_FROM_EMAIL`

**Option B: Use Local .env File**

```bash
# Copy from env.example and fill in values
cp env.example .env
# Edit .env with your actual values
```

---

### Step 2: Create Stripe Checkout Session

**Run this command:**

```bash
cd /Users/ikennaokeke/Documents/SINNA1.0
pnpm tsx scripts/create-live-checkout.ts
```

**Expected Output:**
```
🔗 Creating LIVE Stripe Checkout Link for Clients
──────────────────────────────────────────────────────
Mode: LIVE (or TEST)
Price ID: price_1SLDYEFOUj5aKuFKieTbbTX1
Base URL: https://sinna.site
──────────────────────────────────────────────────────

✅ Checkout session created successfully!

======================================================================
🔗 CLIENT CHECKOUT LINK (Share this with clients):
======================================================================
https://checkout.stripe.com/c/pay/cs_test_...
======================================================================
```

**Copy the checkout URL** - you'll use it in the next step.

---

### Step 3: Complete Test Payment

**A. Open Checkout URL**

Open the checkout URL from Step 2 in your browser.

**B. Enter Test Email**

Enter your test email address (e.g., `ikennaokeke1996@gmail.com`)

**C. Use Stripe Test Card**

If in **TEST mode**, use:
- **Card Number:** `4242 4242 4242 4242`
- **Expiry:** `12/25` (any future date)
- **CVC:** `123` (any 3 digits)
- **ZIP:** `12345` (any 5 digits)

If in **LIVE mode**, use a real card (small charge will occur).

**D. Complete Payment**

Click "Subscribe" or "Pay" to complete the payment.

---

### Step 4: Wait for Webhook Processing

**Timeline:**
- **0-10 seconds:** Payment completes
- **10-30 seconds:** Stripe sends webhook to your API
- **30-60 seconds:** API processes webhook, creates tenant, sends email

**What's Happening:**
1. Stripe sends `checkout.session.completed` webhook
2. Your API receives webhook at `/webhooks/stripe`
3. API creates tenant in database
4. API generates API key
5. API sends email with API key

---

### Step 5: Verify Webhook Processing

**Check Render Logs:**

1. Go to: https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg
2. Click **"Logs"** tab
3. Look for recent entries:

**Success Indicators:**
```
✅ checkout.session.completed event received
✅ Tenant and API key created successfully
✅ API key email sent successfully
✅ Email sent successfully via Resend (or SendGrid)
```

**Error Indicators:**
```
❌ Failed to send API key email
❌ No email service configured
❌ Failed to create tenant
```

---

### Step 6: Check Email Inbox

**Check your test email inbox** (`ikennaokeke1996@gmail.com`)

**Look for:**
- **From:** `noreply@sinna.site` (or your `NOTIFY_FROM_EMAIL`)
- **Subject:** `Your Sinna API Key is Ready! 🎉`
- **Body:** Contains API key (starts with `sk_live_...` or `sk_test_...`)

**Email Content Should Include:**
```
Your API key: sk_live_[REDACTED]

Base URL: https://sinna.site

Keep this key secure and use it in the X-API-Key header for all requests.
```

**If email not received:**
- Check spam/junk folder
- Wait 1-2 minutes (email delivery can be delayed)
- Check Render logs for email errors
- Verify email service is configured correctly

---

### Step 7: Verify Database

**Check tenant was created:**

```bash
# Connect to your database (or use Render shell)
psql $DATABASE_URL

# Run query:
SELECT id, name, active, status, stripe_customer_id, stripe_subscription_id, created_at 
FROM tenants 
WHERE name = 'ikennaokeke1996@gmail.com' 
ORDER BY created_at DESC 
LIMIT 1;
```

**Expected Result:**
- Should show tenant with `active = true`
- Should have `stripe_customer_id` and/or `stripe_subscription_id`
- `status` should be `'active'`

**Check API key was created:**

```sql
-- Get tenant ID from above query, then:
SELECT key_hash, tenant_id, created_at 
FROM api_keys 
WHERE tenant_id = '<tenant-id-from-above>' 
ORDER BY created_at DESC 
LIMIT 1;
```

**Expected Result:**
- Should show API key hash
- Should match tenant ID

---

### Step 8: Test API Key

**Use the API key from email to test API:**

```bash
# Replace <api-key> with key from email
curl -H "x-api-key: <api-key>" \
  https://sinna1-0.onrender.com/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "database": "connected",
  "redis": "connected",
  ...
}
```

**If API key works:**
- ✅ Test successful!
- ✅ API key is valid
- ✅ Tenant is active
- ✅ Everything is working correctly

---

## ✅ Success Checklist

After completing all steps, verify:

- [ ] Checkout session created successfully
- [ ] Payment completed successfully
- [ ] Webhook received by API (check Render logs)
- [ ] Tenant created in database
- [ ] API key generated and stored
- [ ] Email sent (check Render logs)
- [ ] Email received in inbox
- [ ] API key visible in email
- [ ] API key works for API requests

---

## 🆘 Troubleshooting

### Payment Completed But No Email

**Check 1: Email Service Configuration**
- Verify `RESEND_API_KEY` or `SENDGRID_API_KEY` is set in Render
- Check Render logs for email service errors

**Check 2: Webhook Processing**
- Verify webhook was received (check Render logs)
- Look for "checkout.session.completed" event
- Check for any errors in webhook processing

**Check 3: Email Address**
- Verify email address is correct
- Check spam folder
- Try a different email address

---

### Webhook Not Received

**Check 1: Stripe Webhook Configuration**
- Go to: https://dashboard.stripe.com/webhooks
- Verify endpoint URL: `https://sinna1-0.onrender.com/webhooks/stripe`
- Verify `checkout.session.completed` event is enabled
- Check recent deliveries for errors

**Check 2: Webhook Secret**
- Verify `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard
- Check Render logs for signature verification errors

---

### API Key Not Generated

**Check Database:**
- Verify tenant was created
- Check for API key records
- Look for database errors in Render logs

**Check Logs:**
- Look for "Failed to create tenant"
- Look for "Failed to generate API key"
- Check for database connection errors

---

## 📊 Test Results Template

```
Test Date: ___________
Test Email: ___________
Payment Amount: $___________

Step 1 - Checkout Created: [ ] Yes [ ] No
Step 2 - Payment Completed: [ ] Yes [ ] No
Step 3 - Webhook Received: [ ] Yes [ ] No
Step 4 - Tenant Created: [ ] Yes [ ] No
Step 5 - API Key Generated: [ ] Yes [ ] No
Step 6 - Email Sent: [ ] Yes [ ] No
Step 7 - Email Received: [ ] Yes [ ] No
Step 8 - API Key Works: [ ] Yes [ ] No

Issues Found: ___________
```

---

## 🎯 Quick Reference Commands

```bash
# Create checkout link
pnpm tsx scripts/create-live-checkout.ts

# Test webhook (simulate without payment)
pnpm tsx scripts/test-webhook.ts ikennaokeke1996@gmail.com

# Check Render logs
# Go to: https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg → Logs

# Test API key
curl -H "x-api-key: <your-api-key>" https://sinna1-0.onrender.com/health
```

---

**Ready to test?** Follow the steps above! 🚀

