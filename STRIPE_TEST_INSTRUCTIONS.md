# 🧪 Stripe Payment Test - Step-by-Step Instructions

**Date:** 2025-01-27  
**Purpose:** Test that API key is sent to customer email after Stripe payment

---

## 🎯 Quick Test (Recommended)

### Option 1: Use Test Script (Easiest)

```bash
# Set your test email
export TEST_EMAIL="your-test-email@example.com"

# Run the test script
pnpm tsx scripts/test-stripe-payment-flow.ts $TEST_EMAIL
```

**What it does:**
1. ✅ Creates Stripe checkout session
2. ✅ Simulates `checkout.session.completed` webhook
3. ✅ Verifies tenant created in database
4. ✅ Verifies API key generated
5. ✅ Checks if email was sent

**Expected Output:**
- ✅ Webhook sent successfully
- ✅ Tenant found in database
- ✅ API key found in database
- 📧 Check email inbox for API key

---

### Option 2: Real Stripe Test Payment

**Step 1: Create Checkout Link**

```bash
# Generate a checkout link
pnpm tsx scripts/create-live-checkout.ts
```

**Step 2: Complete Payment**

1. Open the checkout URL in browser
2. Enter your test email address
3. Use Stripe test card:
   - **Card:** `4242 4242 4242 4242`
   - **Expiry:** `12/25` (any future date)
   - **CVC:** `123` (any 3 digits)
   - **ZIP:** `12345`
4. Complete payment

**Step 3: Wait for Webhook**

- Stripe automatically sends webhook (usually within 10-30 seconds)
- Check Render logs for processing

**Step 4: Check Email**

- Check inbox for test email
- Subject: "Your Sinna API Key is Ready! 🎉"
- Should contain API key

---

## 🔍 Verification Steps

### 1. Check Render Logs

**Web Service Logs:**
```
https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg
```

**Look for:**
- ✅ `checkout.session.completed` event received
- ✅ `Tenant and API key created successfully`
- ✅ `API key email sent successfully`
- ✅ `Email sent successfully via Resend` (or SendGrid)

**If you see errors:**
- ❌ `Failed to send API key email` → Check email service config
- ❌ `No email service configured` → Add RESEND_API_KEY or SENDGRID_API_KEY
- ❌ `Tenant creation failed` → Check database connection

---

### 2. Check Database

```sql
-- Check tenant was created
SELECT id, name, active, status, stripe_customer_id, created_at 
FROM tenants 
WHERE name = '<test-email>' 
ORDER BY created_at DESC 
LIMIT 1;

-- Check API key was created
SELECT key_hash, tenant_id, created_at 
FROM api_keys 
WHERE tenant_id = '<tenant-id>' 
ORDER BY created_at DESC 
LIMIT 1;
```

---

### 3. Check Email Inbox

**Email Details:**
- **From:** `noreply@sinna.site` (or `NOTIFY_FROM_EMAIL` value)
- **To:** Your test email address
- **Subject:** `Your Sinna API Key is Ready! 🎉`
- **Body:** Contains API key (starts with `sk_live_` or `sk_test_`)

**If email not received:**
1. Check spam/junk folder
2. Verify email service is configured (Resend or SendGrid)
3. Check Render logs for email errors
4. Verify `NOTIFY_FROM_EMAIL` is set correctly

---

### 4. Test API Key

```bash
# Replace <api-key> with key from email
curl -H "x-api-key: <api-key>" \
  https://sinna1-0.onrender.com/health

# Should return:
# {"status":"ok","database":"connected",...}
```

---

## 🛠️ Troubleshooting

### Email Not Sent

**Check Environment Variables:**
```bash
# In Render dashboard, verify these are set:
- RESEND_API_KEY (or SENDGRID_API_KEY)
- NOTIFY_FROM_EMAIL
```

**Check Logs:**
- Look for: `No email service configured`
- Look for: `Failed to send API key email`
- Check Resend/SendGrid API errors

**Common Issues:**
- Email service not configured → Add RESEND_API_KEY or SENDGRID_API_KEY
- Invalid email address → Check email format
- Email service API error → Check API key validity
- Rate limiting → Wait and retry

---

### Webhook Not Received

**Check Stripe Webhook Configuration:**
1. Go to: https://dashboard.stripe.com/webhooks
2. Verify endpoint: `https://sinna1-0.onrender.com/webhooks/stripe`
3. Verify events: `checkout.session.completed` is enabled
4. Check recent deliveries for errors

**Check Render Logs:**
- Look for webhook requests
- Check for signature verification errors
- Verify `STRIPE_WEBHOOK_SECRET` is correct

---

### Tenant Not Created

**Check Database:**
- Verify `DATABASE_URL` is set correctly
- Check database connection in logs
- Verify migrations have run

**Check Logs:**
- Look for: `Failed to create tenant`
- Check for database errors
- Verify tenant creation logic

---

## ✅ Success Criteria

**Test is successful if:**
- ✅ Webhook received and processed
- ✅ Tenant created in database
- ✅ API key generated and stored
- ✅ Email sent to customer
- ✅ API key visible in email
- ✅ API key works for API requests

---

## 📊 Test Results Template

```
Test Date: ___________
Test Email: ___________

Webhook Status: [ ] Received [ ] Processed [ ] Failed
Tenant Created: [ ] Yes [ ] No
API Key Generated: [ ] Yes [ ] No
Email Sent: [ ] Yes [ ] No
Email Received: [ ] Yes [ ] No
API Key Works: [ ] Yes [ ] No

Issues Found: ___________
```

---

**Ready to test?** Run the test script or follow Option 2 above!

