# 🧪 Stripe Webhook Test Guide

## ✅ Step 1: Verify Stripe Integration (Already Done!)

✅ API Key: Valid (LIVE mode)  
✅ Price ID: Valid ($2,000/month)  
✅ Checkout Session: Can be created  

---

## 🔗 Step 2: Generate Client Checkout Links

Run this command to generate checkout links for clients:

```bash
export STRIPE_SECRET_KEY=$(grep "^STRIPE_SECRET_KEY=" render-env-vars.txt | cut -d'=' -f2)
export STRIPE_STANDARD_PRICE_ID=price_1SLDYEFOUj5aKuFKieTbbTX1
export BASE_URL=https://sinna.site

pnpm tsx scripts/create-live-checkout.ts
```

This will output:
- ✅ Checkout Session URL (shareable with clients)
- ✅ Payment Link URL (alternative method)

---

## 🔔 Step 3: Test Webhook Endpoint

### Option A: Complete a Test Payment (Recommended)

1. **Use the checkout link** generated above
2. **Enter test email**: `test@example.com` (or your test email)
3. **Use Stripe test card** (if in test mode):
   - Card: `4242 4242 4242 4242`
   - Expiry: `12/25` (any future date)
   - CVC: `123` (any 3 digits)
   - ZIP: `12345`
4. **Complete payment**
5. **Check Render logs** for:
   - `checkout.session.completed`
   - `New subscription created, API key generated`
   - `API key: sk_live_...`
   - `API key email sent successfully`

### Option B: Use Stripe Dashboard to Re-send Webhook

1. **Go to Stripe Dashboard**: https://dashboard.stripe.com/webhooks
2. **Click on your webhook endpoint** (`https://sinna.site/webhooks/stripe`)
3. **Find a recent `checkout.session.completed` event**
4. **Click "Send test webhook"** or **"Re-send"**
5. **Check Render logs** for webhook processing

### Option C: Manual Webhook Test (Local Development)

```bash
# Set environment variables
export STRIPE_SECRET_KEY=$(grep "^STRIPE_SECRET_KEY=" render-env-vars.txt | cut -d'=' -f2)
export STRIPE_WEBHOOK_SECRET=$(grep "^STRIPE_WEBHOOK_SECRET=" render-env-vars.txt | cut -d'=' -f2)

# Run webhook test script
pnpm tsx scripts/test-webhook.ts test@example.com
```

---

## ✅ Step 4: Verify Webhook Processing

After completing a payment or re-sending webhook, verify:

### Check Render Logs

1. **Go to Render Dashboard** → Your API service → Logs
2. **Search for**:
   - `checkout.session.completed`
   - `New subscription created`
   - `API key: sk_live_...`
   - `API key email sent successfully`

### Check Database

Run diagnostic on Render Shell:

```bash
cd /opt/render/project/src
pnpm tsx scripts/diagnose-webhook.ts test@example.com
```

Expected output:
- ✅ Tenant found
- ✅ API key found
- ✅ Email service configured

### Check Email

- Check inbox for email from `noreply@sinna.site`
- Subject: "Your Sinna API Key is Ready! 🎉"
- Contains API key starting with `sk_live_...`

---

## 🔧 Troubleshooting

### Webhook Not Received

**Symptoms:**
- No tenant created in database
- No API key generated
- No email sent

**Solutions:**
1. **Verify webhook endpoint** in Stripe Dashboard:
   - URL: `https://sinna.site/webhooks/stripe`
   - Events enabled: `checkout.session.completed`
2. **Verify webhook secret** in Render:
   - `STRIPE_WEBHOOK_SECRET` matches Stripe webhook signing secret
3. **Check Render logs** for webhook errors:
   - `Stripe signature verification failed`
   - `Invalid signature`

### Webhook Received But Email Failed

**Symptoms:**
- Tenant created ✅
- API key created ✅
- Email not sent ❌

**Solutions:**
1. **Check email service** configuration:
   - `RESEND_API_KEY` or `SENDGRID_API_KEY` set in Render
2. **Check Render logs** for email errors:
   - `Failed to send API key email`
   - Email service API errors
3. **Retrieve API key from logs**:
   - Search logs for `API key: sk_live_...`
   - Copy the key from logs

### API Key Not Generated

**Symptoms:**
- Tenant created ✅
- API key NOT created ❌

**Solutions:**
1. **Check Render logs** for errors:
   - `Failed to create tenant and API key`
   - Database errors
2. **Run diagnostic script**:
   ```bash
   pnpm tsx scripts/diagnose-webhook.ts test@example.com
   ```
3. **Manually generate API key**:
   ```bash
   pnpm tsx scripts/retrieve-api-key.ts test@example.com
   ```

---

## 📋 Quick Test Checklist

- [ ] Stripe integration test passed ✅
- [ ] Client checkout links generated ✅
- [ ] Webhook endpoint configured in Stripe ✅
- [ ] Webhook secret set in Render ✅
- [ ] Test payment completed ✅
- [ ] Webhook received (check logs) ✅
- [ ] Tenant created (check database) ✅
- [ ] API key generated (check logs/database) ✅
- [ ] Email sent (check inbox) ✅

---

## 🎯 Next Steps

1. **Share checkout links** with clients
2. **Monitor webhook processing** in Render logs
3. **Verify email delivery** for each new subscription
4. **Set up monitoring** for webhook failures

