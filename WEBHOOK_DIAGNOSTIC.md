# 🔍 Webhook Diagnostic & Fix Guide

Since your email service is configured and has worked before, the issue is likely that **the Stripe webhook wasn't received**.

## Quick Check: Was the Webhook Received?

Run this diagnostic script on Render:

```bash
# On Render Shell or via Render CLI
cd /opt/render/project/src
pnpm tsx scripts/diagnose-webhook.ts road2yaadi@gmail.com
```

This will tell you:
- ✅ If tenant was created (webhook received)
- ✅ If API key was created
- ✅ If email service is configured
- ❌ What failed and why

---

## Most Likely Issue: Stripe Webhook Not Configured

If the diagnostic shows **no tenant found**, the webhook wasn't received. Here's how to fix it:

### Step 1: Configure Stripe Webhook

1. **Go to Stripe Dashboard**: https://dashboard.stripe.com/test/webhooks
2. **Click "Add endpoint"**
3. **Endpoint URL**: `https://sinna.site/webhooks/stripe`
4. **Select events to listen to**:
   - ✅ `checkout.session.completed`
   - ✅ `invoice.payment_succeeded`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
   - ✅ `invoice.payment_failed`
5. **Click "Add endpoint"**
6. **Copy the "Signing secret"** (starts with `whsec_...`)

### Step 2: Add Webhook Secret to Render

1. **Go to Render Dashboard** → Your API service → Environment
2. **Add environment variable**:
   - Key: `STRIPE_WEBHOOK_SECRET`
   - Value: `whsec_...` (the signing secret from Stripe)
3. **Save** → Service will restart

### Step 3: Re-send the Webhook Event

1. **Go back to Stripe Dashboard** → Webhooks
2. **Click on your webhook endpoint**
3. **Find the `checkout.session.completed` event** for your recent payment
4. **Click "Send test webhook"** or **"Re-send"**

This will trigger the webhook again and send the email.

---

## Alternative: Manual API Key Generation

If you need the API key **right now** and can't wait for webhook:

```bash
# On Render Shell
cd /opt/render/project/src
pnpm tsx scripts/retrieve-api-key.ts road2yaadi@gmail.com
```

This will:
- Check if tenant exists (create if not)
- Generate API key
- Send email with API key

---

## Check Render Logs for Clues

1. **Render Dashboard** → Your API service → Logs
2. **Search for**:
   - `road2yaadi@gmail.com`
   - `checkout.session.completed`
   - `API key`
   - `webhook`
   - `email`

Look for:
- ✅ `New subscription created, API key generated` → Webhook worked!
- ✅ `API key email sent successfully` → Email was sent
- ❌ `Failed to send API key email` → Email service issue
- ❌ `Stripe signature verification failed` → Webhook secret mismatch
- ❌ `No email in checkout.session.completed event` → Webhook payload issue

---

## Updated Code

I've updated the webhook handler to:
- ✅ **Log the API key** so you can retrieve it from logs if email fails
- ✅ **Better error handling** for email failures (won't break webhook processing)
- ✅ **More detailed logging** for debugging

**Deploy this update** and the API key will be visible in logs even if email fails.

---

## Next Steps

1. **Run diagnostic**: `pnpm tsx scripts/diagnose-webhook.ts road2yaadi@gmail.com`
2. **Check Render logs** for webhook/email errors
3. **Configure Stripe webhook** if not already done
4. **Re-send webhook event** from Stripe Dashboard
5. **Or run retrieve script** to get API key immediately

