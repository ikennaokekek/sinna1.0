# 🔗 Your Stripe Checkout Link

## ⚡ FASTEST WAY: Stripe Dashboard

**Click this link to create checkout session:**
👉 **https://dashboard.stripe.com/test/checkout**

**Or use this direct link (if logged in):**
👉 **https://dashboard.stripe.com/test/checkout/create**

---

## 📋 Checkout Session Settings

When creating the checkout session, use these exact settings:

```
Mode: Subscription
Price ID: price_1SLDYEFOUj5aKuFKieTbbTX1
Customer Email: road2yaadi@gmail.com
Success URL: https://sinna.site/billing/success?session_id={CHECKOUT_SESSION_ID}
Cancel URL: https://sinna.site/billing/cancel
```

---

## 💳 Test Payment Details

After you get the checkout URL, use these test card details:

- **Card Number:** `4242 4242 4242 4242`
- **Expiry:** `12/25` (any future date)
- **CVC:** `123` (any 3 digits)
- **ZIP:** `12345` (any 5 digits)

---

## ✅ What Happens Next

1. Complete payment with test card
2. Stripe sends webhook to Sinna API
3. System creates tenant + generates API key
4. **API key emailed to:** `road2yaadi@gmail.com`
5. Use API key to run production verification tests

---

## 🔧 Alternative: If You Have Valid Stripe Key

If you get a new Stripe secret key from https://dashboard.stripe.com/apikeys:

```bash
export STRIPE_SECRET_KEY=sk_test_... # or sk_live_...
export STRIPE_STANDARD_PRICE_ID=price_1SLDYEFOUj5aKuFKieTbbTX1
export TEST_EMAIL=road2yaadi@gmail.com

node scripts/create-checkout-link.js
```

---

**Current Issue:** Your Stripe secret key is expired.  
**Solution:** Use Stripe Dashboard method above (works immediately!)

