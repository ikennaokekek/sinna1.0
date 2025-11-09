# 🔍 Webhook Diagnostic Results & Live Checkout Link Guide

## ⚠️ Current Issue: Stripe Secret Key Expired

Your Stripe secret key (`sk_live_...`) is expired. You need to get a new one from Stripe Dashboard.

---

## 📋 Part 1: Run Diagnostic on Render

**You asked me to run this, but I can't access Render directly. Here's what to do:**

### On Render Shell:

```bash
cd /opt/render/project/src
pnpm tsx scripts/diagnose-webhook.ts road2yaadi@gmail.com
```

### What to Look For:

**✅ GOOD SIGNS:**
- `✅ RESULT: TENANT FOUND` → Webhook was received
- `✅ RESULT: API KEY(S) FOUND` → API key was created
- `✅ RESULT: EMAIL SERVICE CONFIGURED` → Email service is set up

**❌ BAD SIGNS:**
- `❌ RESULT: NO TENANT FOUND` → Webhook was NOT received
- `❌ RESULT: NO API KEY FOUND` → Webhook received but API key creation failed
- `❌ RESULT: NO EMAIL SERVICE CONFIGURED` → Email keys missing

### If Tenant Exists But No Email:

The API key is in Render logs! Search logs for:
- `API key: sk_live_...`
- `road2yaadi@gmail.com`
- `New subscription created`

---

## 🔑 Part 2: Get New Stripe Secret Key

1. **Go to Stripe Dashboard**: https://dashboard.stripe.com/apikeys
2. **Make sure you're in LIVE mode** (toggle in top right)
3. **Click "Create secret key"** or use existing one
4. **Copy the key** (starts with `sk_live_...`)

---

## 🔗 Part 3: Generate Live Checkout Link for Clients

Once you have a valid Stripe key:

### Option A: Run Script Locally

```bash
export STRIPE_SECRET_KEY=sk_live_YOUR_NEW_KEY_HERE
export STRIPE_STANDARD_PRICE_ID=price_1SLDYEFOUj5aKuFKieTbbTX1
export BASE_URL=https://sinna.site

pnpm tsx scripts/create-live-checkout.ts
```

### Option B: Use Stripe Dashboard (Easiest)

1. **Go to**: https://dashboard.stripe.com/payment-links
2. **Click "Create payment link"**
3. **Select your product**: Standard Plan ($2,000/month)
4. **Settings**:
   - Mode: Subscription
   - Success URL: `https://sinna.site/billing/success?session_id={CHECKOUT_SESSION_ID}`
   - Cancel URL: `https://sinna.site/billing/cancel`
5. **Click "Create"**
6. **Copy the Payment Link URL** → Share with clients!

### Option C: Stripe Checkout Sessions

1. **Go to**: https://dashboard.stripe.com/checkout/sessions
2. **Click "Create checkout session"**
3. **Settings**:
   - Mode: Subscription
   - Price: `price_1SLDYEFOUj5aKuFKieTbbTX1`
   - Success URL: `https://sinna.site/billing/success?session_id={CHECKOUT_SESSION_ID}`
   - Cancel URL: `https://sinna.site/billing/cancel`
   - Customer email: (leave blank - clients enter their own)
4. **Click "Create"**
5. **Copy the Checkout URL** → Share with clients!

---

## 📧 What Happens When Client Pays

1. ✅ Client clicks checkout link
2. ✅ Client enters email and payment details
3. ✅ Payment succeeds
4. ✅ Stripe sends webhook to `https://sinna.site/webhooks/stripe`
5. ✅ Sinna API creates tenant + generates API key
6. ✅ API key emailed to client's email address

---

## 🔧 Verify Webhook is Configured

**Critical:** Make sure Stripe webhook is set up:

1. **Stripe Dashboard** → Developers → Webhooks
2. **Endpoint URL**: `https://sinna.site/webhooks/stripe`
3. **Events enabled**:
   - ✅ `checkout.session.completed`
   - ✅ `invoice.payment_succeeded`
   - ✅ `customer.subscription.updated`
4. **Webhook Secret**: Copy `whsec_...` → Add to Render as `STRIPE_WEBHOOK_SECRET`

---

## 📋 Quick Checklist

- [ ] Run diagnostic on Render: `pnpm tsx scripts/diagnose-webhook.ts road2yaadi@gmail.com`
- [ ] Get new Stripe secret key from dashboard
- [ ] Update `STRIPE_SECRET_KEY` in Render env vars
- [ ] Verify webhook endpoint is configured in Stripe
- [ ] Generate checkout link (Option B or C above)
- [ ] Test checkout link with test card
- [ ] Verify API key email is sent

---

## 🎯 Next Steps

1. **Run the diagnostic** on Render to see what happened
2. **Get new Stripe key** from dashboard
3. **Generate checkout link** using Option B (Stripe Dashboard - easiest)
4. **Share link with clients** - they can subscribe directly!

The checkout link will work for all clients - they just enter their own email and payment details.

