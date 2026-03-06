# 🔧 Fix: API Key Email Not Sent After Payment

## Current architecture

Stripe → Render (`/webhooks/stripe`) → Replit onboarding service (`/internal/onboard`).  
Render **always** processes `checkout.session.completed` (no skip, no feature flag) and calls the onboarding service.

---

## ✅ Solution 1: Verify onboarding and email

### Step 1: Verify Render environment

Make sure these are set in Render environment:
- `RESEND_API_KEY` OR `SENDGRID_API_KEY` (at least one)
- `NOTIFY_FROM_EMAIL` (e.g., `noreply@sinna.site`)

---

## ✅ Solution 2: Manually Retrieve API Key

If you already completed payment, retrieve the API key:

### Option A: Check Render Logs

1. Go to: https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg → **Logs**
2. Search for: `"API KEY FOR MANUAL RETRIEVAL"`
3. Or search for: `"checkout.session.completed"`
4. Look for the API key in the logs

### Option B: Query Database

If you have database access:

```sql
-- Find tenant by email
SELECT t.id, t.name, t.active, t.plan 
FROM tenants t 
WHERE t.name = 'ikennaokeke1996@gmail.com';

-- Get API key hash (can't reverse, but confirms it exists)
SELECT key_hash, created_at 
FROM api_keys 
WHERE tenant_id = (SELECT id FROM tenants WHERE name = 'ikennaokeke1996@gmail.com');
```

### Option C: Generate New API Key

Run this script to generate a new API key for the tenant:

```bash
cd /Users/ikennaokeke/Documents/SINNA1.0
pnpm tsx scripts/get-api-key.ts ikennaokeke1996@gmail.com
```

This will:
- Find or create tenant
- Generate new API key
- Display it (you can manually email it)

---

## ✅ Solution 3: Check Replit Sync

If Replit handled the checkout, check if it synced to Render:

1. Check Render logs for: `"Tenant sync completed successfully"`
2. Check if tenant exists in database
3. If Replit sent email, check your inbox

---

## 🔍 Debugging Steps

### 1. Check Render Logs

Go to Render Dashboard → Logs and search for:
- `"checkout.session.completed"` or `"Processing checkout.session.completed (Render → onboarding service)"`
- `"Calling onboarding service POST /internal/onboard"`
- `"Replit onboarding successful"` or `"API key email sent successfully"`
- `"Failed to send API key email"`

### 2. Check Webhook Configuration

Verify Stripe webhook is configured:
1. Go to: https://dashboard.stripe.com/webhooks
2. Find webhook endpoint: `https://sinna1-0.onrender.com/webhooks/stripe`
3. Check if `checkout.session.completed` event is enabled
4. Check webhook secret matches `STRIPE_WEBHOOK_SECRET` in Render

### 3. Check Email Service

Verify email service is working:
- Check `RESEND_API_KEY` or `SENDGRID_API_KEY` is set
- Check `NOTIFY_FROM_EMAIL` is set
- Check Render logs for email errors

---

## 📋 Current flow

1. **New payments:** Render always processes `checkout.session.completed`, calls the onboarding service; tenant/API key and email are handled there.
2. **If email was missed:** Use Solution 2 (manually retrieve) or re-send the webhook from Stripe Dashboard.

---

## 🧪 Test After Fix

1. Create new test checkout session
2. Complete payment
3. Check email inbox
4. Verify API key received

