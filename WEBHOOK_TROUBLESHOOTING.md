# 🔧 Webhook Troubleshooting Guide

## Problem: No Email After Stripe Checkout

**Symptom**: Payment successful, but no API key email received.

**Root Cause**: Stripe webhook (`checkout.session.completed`) not reaching your API.

---

## ✅ Immediate Fix: Manually Send API Key

### Option 1: Run on Render Shell (Recommended)

1. **Open Render Shell** for your `sinna-api` web service
2. **Run this command**:
   ```bash
   cd /opt/render/project/src
   pnpm tsx scripts/manual-send-api-key.ts ikennaokeke1996@gmail.com
   ```
3. **The script will**:
   - Check if tenant exists (create if missing)
   - Generate a new API key
   - Send email to `ikennaokeke1996@gmail.com`
   - Print the API key to console (if email fails)

### Option 2: Check Render Logs

If the webhook WAS received but email failed, the API key will be logged:

1. Go to **Render Dashboard** → **sinna-api** → **Logs**
2. Search for: `"API KEY FOR MANUAL RETRIEVAL"`
3. Copy the API key from the log

---

## 🔍 Diagnose Webhook Issue

### Step 1: Check Stripe Webhook Configuration

1. Go to **Stripe Dashboard** → **Developers** → **Webhooks**
2. Find webhook endpoint: `https://sinna.site/webhooks/stripe`
3. **Verify**:
   - ✅ URL is exactly: `https://sinna.site/webhooks/stripe`
   - ✅ Event: `checkout.session.completed` is selected
   - ✅ Status: **Enabled** (not disabled)

### Step 2: Check Recent Webhook Attempts

1. Click on the webhook endpoint
2. Go to **Events** tab
3. Look for recent `checkout.session.completed` events
4. **Check delivery status**:
   - ✅ **200 OK**: Webhook delivered successfully (check Render logs)
   - ❌ **500/Timeout**: Server error (check Render logs for errors)
   - ❌ **No attempt**: Webhook not configured or event not selected

### Step 3: Verify Render Logs

**What to look for**:
- ✅ `POST /webhooks/stripe` request (webhook received)
- ✅ `"Received checkout.session.completed webhook"` log
- ✅ `"New subscription created, API key generated"` log
- ✅ `"API key email sent successfully"` or `"CRITICAL: Failed to send API key email"`

**If you see NO webhook request**:
- Stripe is not sending the webhook
- Check Stripe webhook configuration (Step 1)

**If you see webhook but email failed**:
- Check `RESEND_API_KEY` or `SENDGRID_API_KEY` in Render environment variables
- Check `NOTIFY_FROM_EMAIL` is set to `noreply@sinna.site`
- API key will be in logs for manual retrieval

---

## 🔧 Fix Webhook Configuration

### If Webhook is Missing or Incorrect:

1. **Stripe Dashboard** → **Developers** → **Webhooks**
2. Click **"Add endpoint"** (or edit existing)
3. **Endpoint URL**: `https://sinna.site/webhooks/stripe`
4. **Events to send**: Select `checkout.session.completed`
5. **Save**

### If Webhook Exists but Not Receiving Events:

1. **Test webhook** from Stripe Dashboard:
   - Click on webhook endpoint
   - Click **"Send test webhook"**
   - Select `checkout.session.completed`
   - Check Render logs for `POST /webhooks/stripe`

2. **Resend past event**:
   - Go to **Stripe Dashboard** → **Events**
   - Find your `checkout.session.completed` event
   - Click **"Resend"**
   - Check Render logs

---

## 📋 Verification Checklist

After fixing webhook:

- [ ] Stripe webhook endpoint: `https://sinna.site/webhooks/stripe`
- [ ] Event `checkout.session.completed` is selected
- [ ] Webhook status is **Enabled**
- [ ] Render logs show `POST /webhooks/stripe` after checkout
- [ ] Render logs show `"API key email sent successfully"`
- [ ] Email received at `ikennaokeke1996@gmail.com`

---

## 🚨 If Email Still Fails After Webhook Works

1. **Check email service configuration**:
   ```bash
   # On Render Shell
   echo $RESEND_API_KEY
   echo $SENDGRID_API_KEY
   echo $NOTIFY_FROM_EMAIL
   ```

2. **Test email service**:
   ```bash
   # On Render Shell
   cd /opt/render/project/src
   pnpm tsx scripts/test-email-service.ts ikennaokeke1996@gmail.com
   ```

3. **API key is always logged** if email fails - check Render logs for manual retrieval

---

## 📞 Support

If webhook is configured correctly but still not working:
- Check Render service health: `/health` endpoint
- Verify `STRIPE_WEBHOOK_SECRET` matches Stripe webhook signing secret
- Check Render firewall/network settings (unlikely but possible)

