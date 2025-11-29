# 🔍 Issue: Webhook Not Received

## Problem

Your logs show **NO webhook events** (`checkout.session.completed`). This means:
- Either Stripe didn't send the webhook
- Or webhook was rejected before logging (signature verification failed)

---

## ✅ Step 1: Check Stripe Webhook Configuration

### In Stripe Dashboard:

1. Go to: https://dashboard.stripe.com/webhooks
2. Find webhook endpoint: `https://sinna1-0.onrender.com/webhooks/stripe`
3. Click on it to view details

**Check:**
- ✅ Is endpoint **enabled**?
- ✅ Is `checkout.session.completed` event **selected**?
- ✅ What's the **webhook secret**? (starts with `whsec_...`)

---

## ✅ Step 2: Verify Webhook Secret Matches

**In Render Dashboard:**
1. Go to: https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg → Environment
2. Check `STRIPE_WEBHOOK_SECRET` value
3. **Compare** with Stripe webhook secret

**If they don't match:**
- Webhook signature verification will fail
- Webhook will be rejected (returns 400)
- No logs will be written

**Fix:** Update `STRIPE_WEBHOOK_SECRET` in Render to match Stripe

---

## ✅ Step 3: Check Webhook Delivery Status

**In Stripe Dashboard → Webhooks:**

1. Click on your webhook endpoint
2. Scroll to **"Recent deliveries"**
3. Look for recent `checkout.session.completed` events
4. Check status:
   - ✅ **200** = Success (webhook received)
   - ❌ **400** = Bad Request (signature verification failed)
   - ❌ **500** = Server Error (webhook handler crashed)
   - ❌ **Timeout** = Render didn't respond in time

**What to look for:**
- If status is **400**: Webhook secret mismatch
- If status is **500**: Handler crashed (check logs)
- If no events: Webhook wasn't triggered

---

## ✅ Step 4: Re-send Webhook (Test)

**In Stripe Dashboard:**

1. Go to webhook endpoint
2. Click **"Send test webhook"**
3. Select event: `checkout.session.completed`
4. Click **"Send test webhook"**
5. **Watch Render logs** immediately

**Expected in logs:**
- `"Received checkout.session.completed webhook"`
- `"Processing checkout.session.completed"`
- `"API key email sent successfully"` OR error

---

## ✅ Step 5: Check Webhook Endpoint is Accessible

Test if webhook endpoint responds:

```bash
curl -X POST https://sinna1-0.onrender.com/webhooks/stripe \
  -H "Content-Type: application/json" \
  -d '{"type":"test"}'
```

**Expected:**
- If webhook secret missing: `503` error
- If signature invalid: `400` error
- If valid: `200` with `{"received":true}`

---

## 🐛 Common Issues

### Issue 1: Webhook Secret Mismatch

**Symptoms:**
- Stripe shows webhook status: **400 Bad Request**
- Render logs show: `"Stripe signature verification failed"`

**Fix:**
1. Copy webhook secret from Stripe Dashboard
2. Update `STRIPE_WEBHOOK_SECRET` in Render
3. Save → Service restarts
4. Re-send webhook from Stripe

---

### Issue 2: Webhook Not Configured

**Symptoms:**
- No webhook endpoint in Stripe Dashboard
- No events being sent

**Fix:**
1. Go to Stripe Dashboard → Webhooks
2. Click **"Add endpoint"**
3. URL: `https://sinna1-0.onrender.com/webhooks/stripe`
4. Select events:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copy webhook secret
6. Add to Render as `STRIPE_WEBHOOK_SECRET`

---

### Issue 3: Webhook Endpoint Not Accessible

**Symptoms:**
- Stripe shows: **Timeout** or **Connection refused**
- Render service is down or not responding

**Fix:**
1. Check Render service is running
2. Verify service URL: https://sinna1-0.onrender.com
3. Test webhook endpoint manually

---

## 🚀 Quick Action Plan

1. **Check Stripe Dashboard** → Webhooks → Recent deliveries
2. **Verify webhook secret** matches Render environment variable
3. **Re-send test webhook** from Stripe Dashboard
4. **Watch Render logs** immediately after sending
5. **Share results** with me

---

## 📋 What to Share

Please share:
1. **Stripe webhook status** (200, 400, 500, or no events?)
2. **Webhook secret** from Stripe (first few chars: `whsec_...`)
3. **STRIPE_WEBHOOK_SECRET** from Render (first few chars)
4. **Result of re-sending test webhook**

This will help identify why webhook isn't being received!

