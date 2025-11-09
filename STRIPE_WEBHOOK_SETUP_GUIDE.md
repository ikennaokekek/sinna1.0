# 🔧 Stripe Webhook Setup Guide

## Problem: Webhook Not Being Received

**Diagnostic Result**: No tenant found → Webhook was NOT received or NOT processed

---

## ✅ Step-by-Step Fix

### Step 1: Check Current Configuration

Run this on Render Shell:

```bash
cd /opt/render/project/src
bash scripts/check-webhook-config.sh
```

Or manually check:

```bash
echo "STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET:0:20}..."
echo "STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:0:20}..."
```

---

### Step 2: Configure Stripe Webhook Endpoint

1. **Go to Stripe Dashboard**:
   - Visit: https://dashboard.stripe.com/webhooks
   - Make sure you're in the correct mode (Test or Live)

2. **Add or Edit Webhook Endpoint**:
   - Click **"Add endpoint"** (or edit existing)
   - **Endpoint URL**: `https://sinna.site/webhooks/stripe`
   - **Description**: "Sinna 1.0 API - Checkout completion"

3. **Select Events**:
   - Click **"Select events"**
   - Check: `checkout.session.completed`
   - Click **"Add events"**

4. **Save and Get Signing Secret**:
   - Click **"Add endpoint"** (or **"Save"**)
   - **Copy the "Signing secret"** (starts with `whsec_` or `whsec_test_`)
   - ⚠️ **IMPORTANT**: This secret is only shown once!

---

### Step 3: Add Webhook Secret to Render

1. **Go to Render Dashboard**:
   - Navigate to your `sinna-api` service
   - Go to **Environment** tab

2. **Add/Update Environment Variable**:
   - **Key**: `STRIPE_WEBHOOK_SECRET`
   - **Value**: Paste the signing secret you copied (e.g., `whsec_...` or `whsec_test_...`)
   - Click **"Save Changes"**

3. **Verify Test vs Live Mode**:
   - If using **Test mode**: Secret should start with `whsec_test_`
   - If using **Live mode**: Secret should start with `whsec_`
   - Make sure `STRIPE_SECRET_KEY` matches the same mode!

---

### Step 4: Verify Configuration

1. **Check Render Environment Variables**:
   ```bash
   # On Render Shell
   echo "STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:0:20}..."
   echo "STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET:0:20}..."
   ```

2. **Verify Stripe Webhook**:
   - Go to: https://dashboard.stripe.com/webhooks
   - Find your endpoint: `https://sinna.site/webhooks/stripe`
   - Check **Status**: Should be **"Enabled"** (green)
   - Check **Events**: Should include `checkout.session.completed`

---

### Step 5: Test the Webhook

1. **Send Test Webhook from Stripe**:
   - Go to: https://dashboard.stripe.com/webhooks
   - Click on your endpoint
   - Click **"Send test webhook"**
   - Select: `checkout.session.completed`
   - Click **"Send test webhook"**

2. **Check Render Logs**:
   - Go to Render Dashboard → `sinna-api` → **Logs**
   - Look for:
     - ✅ `POST /webhooks/stripe` (webhook received)
     - ✅ `"Received checkout.session.completed webhook"` (webhook processed)
     - ❌ `"Stripe signature verification failed"` (secret mismatch)

3. **Re-send Past Event** (if test checkout already completed):
   - Go to: https://dashboard.stripe.com/events
   - Find your `checkout.session.completed` event
   - Click **"Resend"**
   - Check Render logs again

---

## 🔍 Troubleshooting

### Issue: "Stripe signature verification failed"

**Cause**: `STRIPE_WEBHOOK_SECRET` doesn't match Stripe's signing secret

**Fix**:
1. Get the correct secret from Stripe Dashboard → Webhooks → Your endpoint → Signing secret
2. Update `STRIPE_WEBHOOK_SECRET` in Render
3. Redeploy or restart the service

---

### Issue: No webhook endpoint in Stripe Dashboard

**Fix**:
1. Create new endpoint: https://dashboard.stripe.com/webhooks
2. URL: `https://sinna.site/webhooks/stripe`
3. Event: `checkout.session.completed`
4. Copy signing secret and add to Render

---

### Issue: Webhook endpoint exists but not receiving events

**Check**:
1. Is endpoint **Enabled**? (not disabled)
2. Is `checkout.session.completed` event **selected**?
3. Is the URL exactly: `https://sinna.site/webhooks/stripe`? (no trailing slash)
4. Check Render logs for any `POST /webhooks/stripe` requests

---

### Issue: Test vs Live Mode Mismatch

**Problem**: Using test webhook secret with live Stripe key (or vice versa)

**Fix**:
- **Test mode**: `STRIPE_SECRET_KEY=sk_test_...` + `STRIPE_WEBHOOK_SECRET=whsec_test_...`
- **Live mode**: `STRIPE_SECRET_KEY=sk_live_...` + `STRIPE_WEBHOOK_SECRET=whsec_...`

Make sure both match the same mode!

---

## ✅ Verification Checklist

After setup, verify:

- [ ] Stripe webhook endpoint exists: `https://sinna.site/webhooks/stripe`
- [ ] Event `checkout.session.completed` is selected
- [ ] Webhook status is **Enabled**
- [ ] `STRIPE_WEBHOOK_SECRET` is set in Render
- [ ] `STRIPE_WEBHOOK_SECRET` matches Stripe Dashboard signing secret
- [ ] `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are in the same mode (test/live)
- [ ] Render logs show `POST /webhooks/stripe` when test webhook is sent
- [ ] No "signature verification failed" errors in logs

---

## 🧪 Quick Test

After configuration:

1. **Create a test checkout**:
   ```bash
   pnpm tsx scripts/quick-checkout.ts
   ```

2. **Complete the payment** with test card: `4242 4242 4242 4242`

3. **Check Render logs** for:
   - `POST /webhooks/stripe`
   - `"Received checkout.session.completed webhook"`
   - `"New subscription created, API key generated"`

4. **Run diagnostic again**:
   ```bash
   pnpm tsx scripts/diagnose-webhook.ts ikennaokeke1996@gmail.com
   ```

Should now show: ✅ **TENANT FOUND**

