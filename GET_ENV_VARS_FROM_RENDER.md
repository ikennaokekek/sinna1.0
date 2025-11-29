# 🔑 Get Environment Variables from Render

**Purpose:** Get Stripe and email configuration from Render to run local tests

---

## 📋 Step 1: Access Render Dashboard

Go to your web service:
```
https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg
```

---

## 📋 Step 2: Copy Environment Variables

1. Click **"Environment"** tab
2. Find and copy these values:

**Required for Stripe Checkout:**
- `STRIPE_SECRET_KEY` - Your Stripe API key
- `STRIPE_STANDARD_PRICE_ID` - Your Stripe price ID
- `STRIPE_WEBHOOK_SECRET` - Webhook signing secret (for webhook tests)

**Required for Email:**
- `RESEND_API_KEY` OR `SENDGRID_API_KEY` - Email service API key
- `NOTIFY_FROM_EMAIL` - From email address

**Optional but Useful:**
- `BASE_URL_PUBLIC` - Public base URL (defaults to https://sinna.site)
- `DATABASE_URL` - For database verification tests

---

## 📋 Step 3: Set Environment Variables

**Option A: Export in Terminal (Temporary)**

```bash
export STRIPE_SECRET_KEY='sk_live_...'
export STRIPE_STANDARD_PRICE_ID='price_...'
export STRIPE_WEBHOOK_SECRET='whsec_...'
export RESEND_API_KEY='re_...'
export NOTIFY_FROM_EMAIL='noreply@sinna.site'
export BASE_URL_PUBLIC='https://sinna.site'
```

**Option B: Create .env File (Persistent)**

```bash
# Create .env file
cat > .env << EOF
STRIPE_SECRET_KEY=sk_live_...
STRIPE_STANDARD_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
NOTIFY_FROM_EMAIL=noreply@sinna.site
BASE_URL_PUBLIC=https://sinna.site
DATABASE_URL=postgresql://...
EOF

# Then use the helper script:
./scripts/create-checkout-with-env.sh
```

---

## 🚀 Step 4: Run Checkout Script

**After setting environment variables:**

```bash
# Option 1: Use helper script (loads .env automatically)
./scripts/create-checkout-with-env.sh

# Option 2: Run directly (if vars already exported)
pnpm tsx scripts/create-live-checkout.ts
```

---

## ✅ Verification

After running, you should see:
- ✅ Checkout session created
- ✅ Checkout URL displayed
- ✅ Session details shown

**Then:**
1. Copy the checkout URL
2. Open in browser
3. Complete test payment
4. Check email for API key

---

**Quick Reference:** Copy values from Render → Export in terminal → Run script

