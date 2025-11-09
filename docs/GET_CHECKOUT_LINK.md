# 🔗 Stripe Checkout Link Generator

## Quick Method: Use Stripe Dashboard

**Fastest way to get a checkout link:**

1. **Go to Stripe Dashboard:**
   - Test Mode: https://dashboard.stripe.com/test/checkout
   - Live Mode: https://dashboard.stripe.com/checkout

2. **Click "Create checkout session"**

3. **Fill in these details:**
   ```
   Mode: Subscription
   Price: price_1SLDYEFOUj5aKuFKieTbbTX1
   Customer Email: road2yaadi@gmail.com
   Success URL: https://sinna.site/billing/success?session_id={CHECKOUT_SESSION_ID}
   Cancel URL: https://sinna.site/billing/cancel
   ```

4. **Click "Create"** and copy the checkout URL

5. **Use Test Card:**
   - Card: `4242 4242 4242 4242`
   - Expiry: `12/25` (any future date)
   - CVC: `123` (any 3 digits)
   - ZIP: `12345` (any 5 digits)

---

## Alternative: Use Script (Requires Valid Stripe Key)

If you have a valid Stripe secret key:

```bash
export STRIPE_SECRET_KEY=sk_test_... # or sk_live_...
export STRIPE_STANDARD_PRICE_ID=price_1SLDYEFOUj5aKuFKieTbbTX1
export TEST_EMAIL=road2yaadi@gmail.com
export BASE_URL=https://sinna.site

node scripts/create-checkout-link.js
```

---

## What Happens After Payment

1. ✅ Stripe processes payment
2. ✅ Webhook sent to `/webhooks/stripe`
3. ✅ System creates tenant + API key
4. ✅ API key emailed to `road2yaadi@gmail.com`
5. ✅ You can use API key for production tests

---

## Current Status

⚠️ **Your Stripe secret key in `render-env-vars.txt` is expired.**

**Recommended:** Use Stripe Dashboard method above (works immediately)

