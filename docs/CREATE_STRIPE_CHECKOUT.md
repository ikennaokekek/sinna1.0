# 🔗 How to Create a Test Stripe Checkout Session

## Option 1: Via Stripe Dashboard (Easiest)

1. **Go to Stripe Dashboard:**
   - Visit: https://dashboard.stripe.com/test/checkout
   - Or: https://dashboard.stripe.com/products (for live mode)

2. **Create Checkout Session:**
   - Click "Create checkout session"
   - Select your product/price: `price_1SLDYEFOUj5aKuFKieTbbTX1`
   - Set customer email: `road2yaadi@gmail.com`
   - Set success URL: `https://sinna.site/billing/success?session_id={CHECKOUT_SESSION_ID}`
   - Set cancel URL: `https://sinna.site/billing/cancel`
   - Click "Create"

3. **Copy the Checkout URL** and use it to complete the test payment

---

## Option 2: Via Stripe CLI (If Installed)

```bash
stripe checkout sessions create \
  --mode=subscription \
  --line-items[0][price]=price_1SLDYEFOUj5aKuFKieTbbTX1 \
  --line-items[0][quantity]=1 \
  --success-url="https://sinna.site/billing/success?session_id={CHECKOUT_SESSION_ID}" \
  --cancel-url="https://sinna.site/billing/cancel" \
  --customer-email=road2yaadi@gmail.com
```

---

## Option 3: Update Stripe Secret Key

**The current Stripe secret key in `render-env-vars.txt` is expired.**

1. **Get New Stripe Secret Key:**
   - Go to: https://dashboard.stripe.com/apikeys
   - Copy your **Secret key** (starts with `sk_live_` or `sk_test_`)

2. **Update Environment Variable:**
   ```bash
   export STRIPE_SECRET_KEY=your_new_secret_key_here
   ```

3. **Then run the checkout creation script:**
   ```bash
   export STRIPE_SECRET_KEY=your_new_secret_key
   export STRIPE_STANDARD_PRICE_ID=price_1SLDYEFOUj5aKuFKieTbbTX1
   export TEST_EMAIL=road2yaadi@gmail.com
   export BASE_URL=https://sinna.site
   
   # If you have tsx installed:
   tsx scripts/create-test-checkout.ts
   
   # Or use curl:
   curl -X POST https://api.stripe.com/v1/checkout/sessions \
     -u "${STRIPE_SECRET_KEY}:" \
     -d "mode=subscription" \
     -d "line_items[0][price]=${STRIPE_STANDARD_PRICE_ID}" \
     -d "line_items[0][quantity]=1" \
     -d "success_url=https://sinna.site/billing/success?session_id={CHECKOUT_SESSION_ID}" \
     -d "cancel_url=https://sinna.site/billing/cancel" \
     -d "customer_email=${TEST_EMAIL}" \
     | jq -r '.url'
   ```

---

## Option 4: Use Test Mode (Recommended for Testing)

If you want to test without a real payment:

1. **Switch to Test Mode:**
   - Use Stripe test secret key (starts with `sk_test_`)
   - Use test price ID (create one in Stripe test mode)

2. **Test Card Numbers:**
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`
   - Requires 3D Secure: `4000 0027 6000 3184`

---

## 📋 What Happens After Payment

1. **Stripe sends webhook** to `/webhooks/stripe`
2. **Webhook handler:**
   - Creates tenant record
   - Generates API key
   - Saves API key hash to database
   - Sends API key via email to `road2yaadi@gmail.com`
3. **You receive email** with your API key
4. **Use API key** for production verification tests

---

## ⚠️ Current Issue

**Your Stripe secret key is expired.** You need to:
1. Get a new secret key from Stripe Dashboard
2. Update `STRIPE_SECRET_KEY` in Render environment variables
3. Then create checkout session

---

## 💡 Quick Fix: Use Stripe Dashboard

**Fastest way right now:**
1. Go to: https://dashboard.stripe.com/test/checkout
2. Click "Create checkout session"
3. Fill in the details above
4. Copy the checkout URL
5. Complete payment with test card
6. Check email for API key

**This will work immediately without needing to update environment variables.**

