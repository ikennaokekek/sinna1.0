# 🔍 Debug: API Key Email Not Being Sent

## ✅ What We Know

1. ✅ Render processes `checkout.session.completed` and calls onboarding service (no skip).
2. ✅ Payment completed successfully
3. ❌ Email not received

---

## 🔍 Diagnostic Steps

### Step 1: Run Diagnostic Script

Run this script to check email service configuration:

```bash
cd /Users/ikennaokeke/Documents/SINNA1.0
pnpm tsx scripts/diagnose-email-issue.ts ikennaokeke1996@gmail.com
```

This will check:
- Email service configuration (Resend/SendGrid)
- Test email sending
- Webhook configuration

---

### Step 2: Check Render Logs

Go to Render Dashboard → Logs and search for:

**Search Terms:**
1. `"checkout.session.completed"` - See if webhook was received
2. `"Processing checkout.session.completed"` - See if handler ran
3. `"API key email sent successfully"` - See if email was sent
4. `"Failed to send API key email"` - See if email failed
5. `"API KEY FOR MANUAL RETRIEVAL"` - See API key if email failed
6. `"No email service configured"` - See if email service is missing

**What to Look For:**

✅ **Good Signs:**
- `"Processing checkout.session.completed (Render → onboarding service)"`
- `"Calling onboarding service POST /internal/onboard"`
- `"Replit onboarding successful"` or `"API key email sent successfully"`

❌ **Problem Signs:**
- `"Replit onboarding failed after retries"` → Onboarding service or network issue
- `"No email service configured"` → Email service missing
- `"Failed to send API key email"` → Email service error
- `"API KEY FOR MANUAL RETRIEVAL"` → Email failed, but key is logged

---

### Step 3: Verify Email Service Configuration

**In Render Dashboard → Environment:**

Check these variables:
- ✅ `RESEND_API_KEY` OR `SENDGRID_API_KEY` (at least one required)
- ✅ `NOTIFY_FROM_EMAIL` (e.g., `noreply@sinna.site`)

**If missing:**
1. Get API key from:
   - Resend: https://resend.com/api-keys
   - SendGrid: https://app.sendgrid.com/settings/api_keys
2. Add to Render environment variables
3. Save → Service will restart

---

### Step 4: Test Email Service Directly

Test if email service works:

```bash
cd /Users/ikennaokeke/Documents/SINNA1.0
pnpm tsx scripts/manually-send-api-key-email.ts ikennaokeke1996@gmail.com
```

**Expected:**
- ✅ Email sent successfully
- ✅ Check inbox for API key

**If fails:**
- Check error message
- Verify API key is valid
- Check email service dashboard

---

### Step 5: Check Webhook Was Received

**In Stripe Dashboard:**
1. Go to: https://dashboard.stripe.com/webhooks
2. Find webhook endpoint: `https://sinna1-0.onrender.com/webhooks/stripe`
3. Click on it → View recent events
4. Look for `checkout.session.completed` event
5. Check if it was successful (200) or failed

**If webhook failed:**
- Check webhook secret matches `STRIPE_WEBHOOK_SECRET` in Render
- Check webhook signature verification

---

## 🐛 Common Issues & Fixes

### Issue 1: Email Service Not Configured

**Symptoms:**
- Logs show: `"No email service configured"`
- Diagnostic script shows: `RESEND_API_KEY: ❌ MISSING`

**Fix:**
1. Add `RESEND_API_KEY` or `SENDGRID_API_KEY` to Render
2. Redeploy service

---

### Issue 2: Email Service API Error

**Symptoms:**
- Logs show: `"Failed to send API key email"`
- Error: `"Resend API returned error"` or `"SendGrid API returned error"`

**Possible Causes:**
- Invalid API key
- Domain not verified (Resend)
- Rate limit exceeded
- Account suspended

**Fix:**
1. Verify API key is valid
2. Check email service dashboard
3. Verify domain is verified (for Resend)
4. Check account status

---

### Issue 3: Webhook Not Received

**Symptoms:**
- No logs for `"checkout.session.completed"`
- Stripe shows webhook failed

**Fix:**
1. Verify webhook endpoint: `https://sinna1-0.onrender.com/webhooks/stripe`
2. Check `STRIPE_WEBHOOK_SECRET` matches Stripe webhook secret
3. Re-send webhook from Stripe Dashboard

---

### Issue 4: Onboarding call failed

**Symptoms:**
- Logs show: `"Replit onboarding failed after retries"` or `"Missing onboarding config"`

**Fix:**
1. Verify `ONBOARD_SERVICE_URL` and `INTERNAL_SERVICE_SECRET` are set in Render and match the Replit onboarding service.
2. Ensure the onboarding service is reachable and returns 2xx for valid HMAC-signed requests.

---

### Issue 5: Email Goes to Spam

**Symptoms:**
- Email sent successfully but not in inbox

**Fix:**
1. Check spam folder
2. Verify domain SPF/DKIM records
3. Use verified domain for `NOTIFY_FROM_EMAIL`

---

## 🚀 Quick Fixes

### Fix 1: Manually Send API Key

If webhook processed but email failed, get API key from logs:

```bash
# Check Render logs for: "API KEY FOR MANUAL RETRIEVAL"
# Or run:
pnpm tsx scripts/manually-send-api-key-email.ts ikennaokeke1996@gmail.com
```

### Fix 2: Re-trigger Webhook

If webhook wasn't received:

1. Go to Stripe Dashboard → Webhooks
2. Find your webhook endpoint
3. Click "Send test webhook" for `checkout.session.completed`
4. This will trigger the handler again

---

## 📋 Checklist

- [ ] Run diagnostic script
- [ ] Check Render logs for webhook events
- [ ] Verify email service is configured
- [ ] Test email service directly
- [ ] Check Stripe webhook status
- [ ] Verify `ONBOARD_SERVICE_URL` and `INTERNAL_SERVICE_SECRET` are set
- [ ] Check spam folder
- [ ] Get API key from logs if email failed

---

**Next:** Run the diagnostic script and share the results!

