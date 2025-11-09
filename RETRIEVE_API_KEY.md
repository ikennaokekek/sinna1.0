# 🔑 How to Retrieve Your API Key

You completed the Stripe checkout but didn't receive an email. Here are **3 ways** to get your API key:

---

## Option 1: Check Render Logs (Fastest)

The webhook might have been received but the email failed to send.

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Open your API service** (`sinna-api`)
3. **Click "Logs"** tab
4. **Search for**: `road2yaadi@gmail.com` or `checkout.session.completed`
5. **Look for**: `API key: sk_live_...` in the logs

If you see the API key in logs → **Copy it and use it!**

---

## Option 2: Run Script on Render (Recommended)

Run this script directly on Render where the database is accessible:

1. **Go to Render Dashboard** → Your API service
2. **Click "Shell"** tab (or use Render CLI)
3. **Run**:
```bash
cd /opt/render/project/src
pnpm tsx scripts/retrieve-api-key.ts road2yaadi@gmail.com
```

This will:
- ✅ Check if tenant exists
- ✅ Generate API key if needed
- ✅ Send email with API key

---

## Option 3: Check Database Directly

If you have database access:

```sql
-- Find tenant
SELECT id, name, active, plan FROM tenants WHERE name = 'road2yaadi@gmail.com';

-- Get API keys (hashed, but you'll see creation time)
SELECT key_hash, created_at FROM api_keys 
WHERE tenant_id = (SELECT id FROM tenants WHERE name = 'road2yaadi@gmail.com');
```

**Note**: API keys are hashed, so you can't see the original. You'll need to generate a new one using Option 2.

---

## Option 4: Configure Stripe Webhook (Prevent Future Issues)

The webhook might not be configured. Set it up:

1. **Go to Stripe Dashboard** → Developers → Webhooks
2. **Add endpoint**: `https://sinna.site/webhooks/stripe`
3. **Select events**:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `customer.subscription.updated`
4. **Copy webhook secret** → Add to Render env vars as `STRIPE_WEBHOOK_SECRET`
5. **Re-send events** → Click "Send test webhook" for `checkout.session.completed`

---

## Quick Test Your API Key

Once you have your API key:

```bash
curl -H "X-API-Key: YOUR_API_KEY_HERE" https://sinna.site/v1/me/subscription
```

Expected response:
```json
{
  "status": "active",
  "plan": "standard",
  ...
}
```

---

## Why Email Might Have Failed

Common reasons:
- ❌ `RESEND_API_KEY` or `SENDGRID_API_KEY` not set in Render
- ❌ Webhook not configured in Stripe
- ❌ Webhook secret mismatch
- ❌ Email service API limits exceeded

**Check Render logs** to see the exact error!

