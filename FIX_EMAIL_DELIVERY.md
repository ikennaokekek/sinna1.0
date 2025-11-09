# 🔧 Fix Email Delivery for Client Onboarding

## Problem
Clients complete Stripe checkout but don't receive API key email automatically. This breaks the onboarding flow.

---

## Root Cause Analysis

The email service code is correct, but emails are failing silently. Possible issues:

1. **Email service not configured** (`RESEND_API_KEY` or `SENDGRID_API_KEY` missing)
2. **Email service API errors** (invalid keys, rate limits, domain verification)
3. **Webhook not received** (Stripe webhook not configured or signature mismatch)
4. **Email going to spam** (domain not verified, SPF/DKIM not set up)

---

## ✅ Fixes Applied

### 1. Improved Email Error Handling
- ✅ Email service now **throws errors** instead of silently failing
- ✅ Detailed error logging with service status
- ✅ API key logged in webhook handler even if email fails

### 2. Enhanced Webhook Logging
- ✅ API key logged prominently when email fails
- ✅ Email service configuration logged
- ✅ Clear error messages for debugging

### 3. Email Service Test Script
- ✅ `scripts/test-email-service.ts` - Test email delivery independently

---

## 🔧 Immediate Actions Required

### Step 1: Verify Email Service Configuration

**In Render Dashboard → sinna-api → Environment:**

Check these variables exist:
- ✅ `RESEND_API_KEY` OR `SENDGRID_API_KEY` (at least one required)
- ✅ `NOTIFY_FROM_EMAIL` (defaults to `noreply@sinna.site`)

**If missing:**
1. Get API key from Resend (https://resend.com/api-keys) or SendGrid (https://app.sendgrid.com/settings/api_keys)
2. Add to Render environment variables
3. Save → Service will restart

### Step 2: Test Email Service

**On Render Shell:**
```bash
cd /opt/render/project/src
pnpm tsx scripts/test-email-service.ts ikennaokeke1996@gmail.com
```

**Expected output:**
- ✅ Email sent successfully!
- Check inbox for test email

**If fails:**
- Check Render logs for detailed error
- Verify API key is valid
- Check email service dashboard for errors

### Step 3: Verify Stripe Webhook Configuration

**In Stripe Dashboard (Test Mode):**
1. Go to: https://dashboard.stripe.com/test/webhooks
2. Check if endpoint exists: `https://sinna.site/webhooks/stripe`
3. Verify events enabled:
   - ✅ `checkout.session.completed`
   - ✅ `invoice.payment_succeeded`
4. Copy webhook signing secret (`whsec_...`)

**In Render Dashboard:**
1. Verify `STRIPE_WEBHOOK_SECRET` matches Stripe secret
2. For test mode, also set `STRIPE_TESTING=true` (optional)

### Step 4: Test Full Flow

1. **Create test checkout:**
   ```bash
   # Local
   set -a; source env.stripe-test; set +a
   pnpm tsx scripts/create-test-checkout.ts
   ```

2. **Complete payment** with test card (4242 4242 4242 4242)

3. **Check Render logs** for:
   - ✅ `checkout.session.completed` received
   - ✅ `New subscription created, API key generated`
   - ✅ `API key email sent successfully`
   - OR ❌ `Failed to send API key email` (with detailed error)

4. **Check email inbox** for API key

---

## 📋 Email Service Requirements

### Resend (Recommended)
- **API Key**: Get from https://resend.com/api-keys
- **Domain**: Verify `sinna.site` domain in Resend dashboard
- **From Email**: Must be verified domain (e.g., `noreply@sinna.site`)

### SendGrid (Alternative)
- **API Key**: Get from https://app.sendgrid.com/settings/api_keys
- **Domain**: Verify `sinna.site` domain in SendGrid
- **From Email**: Must be verified sender

---

## 🔍 Debugging Email Failures

### Check Render Logs

Search for:
- `[EMAIL:ERROR]` - Email service errors
- `Failed to send API key email` - Email delivery failure
- `Resend API returned error` - Resend-specific errors
- `SendGrid API returned error` - SendGrid-specific errors

### Common Errors

1. **"No email service configured"**
   - **Fix**: Add `RESEND_API_KEY` or `SENDGRID_API_KEY` to Render

2. **"Resend failed: 403"**
   - **Fix**: Verify API key is valid and domain is verified

3. **"SendGrid failed: 401"**
   - **Fix**: Verify API key is valid

4. **"Domain not verified"**
   - **Fix**: Verify `sinna.site` domain in email service dashboard

---

## ✅ Success Criteria

After fixes, you should see in Render logs:

```
✅ New subscription created, API key generated
✅ API key email sent successfully to client
```

And client receives email:
- **From**: `noreply@sinna.site`
- **Subject**: "Your Sinna API Key is Ready! 🎉"
- **Body**: Contains API key starting with `sk_live_...`

---

## 🚀 Next Steps

1. **Deploy the improved email error handling** (already done in code)
2. **Verify email service keys** in Render environment
3. **Test email service** using `test-email-service.ts`
4. **Test full checkout flow** end-to-end
5. **Monitor logs** for email delivery success/failure

Once email works, clients will automatically receive their API keys after payment! 🎉

