# 🚨 CRITICAL: Webhook Not Received - Manual Email Fix

## Problem
- ✅ Payment completed successfully
- ❌ No webhook received (`checkout.session.completed` not in logs)
- ❌ No email sent

## Root Cause
The Stripe webhook endpoint is not receiving events. This could be due to:
1. Webhook not configured in Stripe Dashboard
2. Webhook URL incorrect
3. Webhook secret mismatch
4. Network/firewall blocking webhook requests

## Immediate Fix: Send Email Manually

### Step 1: Run Manual Email Script on Render

Go to **Render Dashboard** → **sinna-api** → **Shell** and run:

```bash
cd /opt/render/project/src
export TEST_EMAIL=ikennaokeke1996@gmail.com
pnpm tsx scripts/manual-send-api-key.ts ikennaokeke1996@gmail.com
```

This will:
- ✅ Check if tenant exists (create if needed)
- ✅ Generate API key
- ✅ Send email from `donotreply@sinna.site`
- ✅ Show API key in console if email fails

### Step 2: Verify Email Service Configuration

Before running the script, verify these environment variables in Render:

```
NOTIFY_FROM_EMAIL=donotreply@sinna.site
RESEND_API_KEY=re_xxxxx
# OR
SENDGRID_API_KEY=SG.xxxxx
```

## Fix Webhook Configuration (For Future Payments)

### Step 1: Configure Stripe Webhook

1. Go to **Stripe Dashboard** → **Developers** → **Webhooks**
2. Click **"Add endpoint"** (or edit existing)
3. Set endpoint URL: `https://sinna.site/webhooks/stripe`
4. Select events:
   - ✅ `checkout.session.completed`
   - ✅ `invoice.payment_succeeded`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
5. Click **"Add endpoint"**
6. Copy the **Signing secret** (starts with `whsec_`)

### Step 2: Add Webhook Secret to Render

1. Go to **Render Dashboard** → **sinna-api** → **Environment**
2. Add/Update: `STRIPE_WEBHOOK_SECRET=whsec_xxxxx`
3. Save and redeploy

### Step 3: Test Webhook

1. Go to **Stripe Dashboard** → **Developers** → **Webhooks**
2. Click on your webhook endpoint
3. Click **"Send test webhook"**
4. Select `checkout.session.completed`
5. Click **"Send test webhook"**
6. Check Render logs for: `"Received checkout.session.completed webhook"`

## Verify Webhook is Working

After configuring, check Render logs for:
- ✅ `"Received checkout.session.completed webhook"`
- ✅ `"New subscription created, API key generated"`
- ✅ `"API key email sent successfully"`

## Alternative: Use Stripe CLI for Testing

If webhook still doesn't work, test locally with Stripe CLI:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to https://sinna.site/webhooks/stripe

# Trigger test event
stripe trigger checkout.session.completed
```

## Summary

**Immediate Action**: Run `scripts/manual-send-api-key.ts` on Render to send the email NOW.

**Long-term Fix**: Configure Stripe webhook properly so future payments trigger emails automatically.

