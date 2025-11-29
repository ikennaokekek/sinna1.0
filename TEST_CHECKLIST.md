# ✅ Stripe Payment Test Checklist

**Test Date:** ___________

---

## 📋 Pre-Test Setup

- [ ] Environment variables configured (Stripe, Email, Database)
- [ ] Render service is running and accessible
- [ ] Test email address ready (`ikennaokeke1996@gmail.com`)
- [ ] Stripe dashboard accessible

---

## 🧪 Test Steps

### Step 1: Create Checkout Session
- [ ] Run: `pnpm tsx scripts/create-live-checkout.ts`
- [ ] Checkout URL received
- [ ] URL copied for next step

### Step 2: Complete Payment
- [ ] Opened checkout URL in browser
- [ ] Entered test email address
- [ ] Used test card: `4242 4242 4242 4242`
- [ ] Payment completed successfully
- [ ] Redirected to success page

### Step 3: Monitor Webhook
- [ ] Checked Render logs (within 30 seconds)
- [ ] Webhook event received: `checkout.session.completed`
- [ ] Webhook processed successfully
- [ ] No errors in logs

### Step 4: Verify Database
- [ ] Tenant created: `SELECT * FROM tenants WHERE name = '<email>'`
- [ ] API key created: `SELECT * FROM api_keys WHERE tenant_id = '<tenant-id>'`
- [ ] Tenant is active: `active = true`
- [ ] Stripe IDs stored: `stripe_customer_id` and/or `stripe_subscription_id`

### Step 5: Check Email
- [ ] Email received in inbox
- [ ] Subject: "Your Sinna API Key is Ready! 🎉"
- [ ] API key visible in email body
- [ ] API key format correct: `sk_live_...` or `sk_test_...`

### Step 6: Test API Key
- [ ] API key copied from email
- [ ] Tested API endpoint: `curl -H "x-api-key: <key>" https://sinna1-0.onrender.com/health`
- [ ] API responded successfully
- [ ] No authentication errors

---

## ✅ Final Verification

- [ ] All steps completed successfully
- [ ] API key works for API requests
- [ ] Email delivery confirmed
- [ ] Database records correct
- [ ] No errors in logs

---

## 📝 Notes

**Issues Found:**
___________

**API Key Received:**
___________

**Test Result:** [ ] PASS [ ] FAIL

---

**Test Completed:** ___________

