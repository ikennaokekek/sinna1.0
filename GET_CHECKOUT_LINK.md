# 🔗 Get Stripe Checkout Link - Quick Method

## ⚡ Fastest Way

**Run this command with your Stripe credentials:**

```bash
cd /Users/ikennaokeke/Documents/SINNA1.0

STRIPE_SECRET_KEY='sk_live_...' \
STRIPE_STANDARD_PRICE_ID='price_...' \
pnpm tsx scripts/create-live-checkout.ts
```

**Replace:**
- `sk_live_...` with your actual Stripe secret key
- `price_...` with your actual Stripe price ID

---

## 📋 Get Credentials from Render

1. Go to: https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg
2. Click **"Environment"** tab
3. Copy `STRIPE_SECRET_KEY` value
4. Copy `STRIPE_STANDARD_PRICE_ID` value

---

## 🚀 One-Line Command

**After getting values from Render, run:**

```bash
STRIPE_SECRET_KEY='<paste-from-render>' STRIPE_STANDARD_PRICE_ID='<paste-from-render>' pnpm tsx scripts/create-live-checkout.ts
```

**Example:**
```bash
STRIPE_SECRET_KEY='sk_live_abc123...' STRIPE_STANDARD_PRICE_ID='price_1SLDYEFOUj5aKuFKieTbbTX1' pnpm tsx scripts/create-live-checkout.ts
```

---

## ✅ Expected Output

You'll get a checkout URL like:
```
https://checkout.stripe.com/c/pay/cs_live_...
```

**Copy that URL and:**
1. Open in browser
2. Complete test payment
3. Check email for API key

---

**Need help getting the values?** Check Render dashboard → Environment tab

