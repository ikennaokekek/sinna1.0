# 🧪 Test Payment Flow - API Key Email Delivery

**Purpose:** Test how the system sends API key to client email after payment

---

## ✅ Step 1: Create Test Checkout Session

Run this command in your terminal:

```bash
cd /Users/ikennaokeke/Documents/SINNA1.0

STRIPE_SECRET_KEY='sk_test_[REDACTED]' \
STRIPE_STANDARD_PRICE_ID='price_1SLDYEFOUj5aKuFKieTbbTX1' \
TEST_EMAIL='ikennaokeke1996@gmail.com' \
pnpm tsx scripts/create-test-checkout-now.ts
```

**OR** use the simpler script:

```bash
pnpm tsx scripts/create-test-checkout-now.ts
```

This will output a **checkout URL** like:
```
https://checkout.stripe.com/c/pay/cs_test_...
```

---

## ✅ Step 2: Complete Test Payment

1. **Open the checkout URL** in your browser
2. **Use Stripe test card:**
   - Card Number: `4242 4242 4242 4242`
   - Expiry: `12/25` (any future date)
   - CVC: `123` (any 3 digits)
   - ZIP: `12345` (any 5 digits)
3. **Complete payment**

---

## 📧 Step 3: How API Key Email is Sent

After payment completes, this flow happens automatically:

### Flow:
1. **Stripe sends webhook** → `checkout.session.completed` event
2. **Webhook received** → `https://sinna1-0.onrender.com/webhooks/stripe`
3. **Handler processes** (`apps/api/src/routes/webhooks.ts:208-379`):
   - Extracts email from checkout session
   - Creates tenant in database
   - Generates API key (`sk_live_...`)
   - Stores API key (hashed in DB, plain in Redis)
4. **Email sent** (`apps/api/src/routes/webhooks.ts:356-369`):
   - Calls `sendApiKeyEmail(email, apiKey)`
   - Subject: **"Your Sinna API Key is Ready! 🎉"**
   - Contains: API key, base URL, usage instructions
   - Sent via Resend or SendGrid

### Code Location:
- **Webhook Handler:** `apps/api/src/routes/webhooks.ts` (line 208)
- **Email Function:** `apps/api/src/utils/email.ts` (line 16)
- **Email Service:** `apps/api/src/lib/email.ts`

---

## ✅ Step 4: Verify Email Delivery

### Check Email Inbox:
- **To:** `ikennaokeke1996@gmail.com`
- **Subject:** "Your Sinna API Key is Ready! 🎉"
- **Contains:** Your API key (`sk_live_...`)

### Check Render Logs:
1. Go to: https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg
2. Click **"Logs"** tab
3. Search for: `"API key email sent successfully"`
4. Or search for: `"checkout.session.completed"`

### If Email Fails:
The API key is logged in Render logs for manual retrieval:
- Search for: `"API KEY FOR MANUAL RETRIEVAL"`
- The key will be in the log output

---

## 🔍 Troubleshooting

### Webhook Not Received?
1. Check Stripe Dashboard → Developers → Webhooks
2. Verify endpoint: `https://sinna1-0.onrender.com/webhooks/stripe`
3. Check webhook secret matches Render env var: `STRIPE_WEBHOOK_SECRET`

### Email Not Sent?
1. Check Render environment variables:
   - `RESEND_API_KEY` OR `SENDGRID_API_KEY`
   - `NOTIFY_FROM_EMAIL`
2. Check Render logs for email errors
3. API key is logged if email fails (see above)

### Test Card Not Working?
- Make sure you're using TEST mode (`sk_test_...`)
- Use card: `4242 4242 4242 4242`
- Any future expiry date works

---

## 📋 Quick Test Checklist

- [ ] Created checkout session (got URL)
- [ ] Completed payment with test card
- [ ] Checked email inbox (`ikennaokeke1996@gmail.com`)
- [ ] Checked Render logs for "API key email sent successfully"
- [ ] Verified API key received in email
- [ ] Tested API key works: `curl -H "X-API-Key: <key>" https://sinna.site/health`

---

**Ready to test!** Run the command above to get your checkout URL.

