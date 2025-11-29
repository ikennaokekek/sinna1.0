# 🔧 Fix: API Key Email Not Sent After Payment

## 🔍 Problem Identified

The `checkout.session.completed` webhook handler is **DISABLED by default** because the system expects Replit to handle checkout and email delivery.

**Code Location:** `apps/api/src/routes/webhooks.ts` (lines 100-116)

```typescript
if (process.env.ENABLE_RENDER_CHECKOUT_HANDLER === 'true') {
  // Process checkout and send email
} else {
  // Skip - handled by Replit
}
```

---

## ✅ Solution 1: Enable Render Checkout Handler (Recommended)

Enable the Render handler to process checkout sessions and send API key emails:

### Step 1: Add Environment Variable in Render

1. Go to: https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg
2. Click **"Environment"** tab
3. Click **"Add Environment Variable"**
4. Add:
   - **Key:** `ENABLE_RENDER_CHECKOUT_HANDLER`
   - **Value:** `true`
5. Click **"Save Changes"**
6. **Redeploy** the service (or wait for auto-deploy)

### Step 2: Verify Email Service is Configured

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
- `"checkout.session.completed"`
- `"Skipping checkout.session.completed handler"`
- `"API key email sent successfully"`
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

## 🚀 Quick Fix (Enable Handler Now)

**Add this to Render environment variables:**

```
ENABLE_RENDER_CHECKOUT_HANDLER=true
```

Then redeploy or wait for auto-deploy. Future payments will automatically send API key emails.

---

## 📋 After Enabling Handler

Once `ENABLE_RENDER_CHECKOUT_HANDLER=true` is set:

1. **New payments** will automatically:
   - Create tenant
   - Generate API key
   - Send email with API key

2. **For existing payment** (that didn't get email):
   - Use Solution 2 (manually retrieve)
   - Or trigger webhook again from Stripe Dashboard

---

## 🧪 Test After Fix

1. Create new test checkout session
2. Complete payment
3. Check email inbox
4. Verify API key received

