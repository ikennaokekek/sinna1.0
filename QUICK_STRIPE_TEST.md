# ⚡ Quick Stripe Payment Test

**Goal:** Verify API key is sent to email after Stripe payment

---

## 🚀 Fastest Test Method

### Step 1: Run Test Script

```bash
cd /Users/ikennaokeke/Documents/SINNA1.0

# Make sure you have environment variables set (from Render or .env)
# Then run:
pnpm tsx scripts/test-stripe-payment-flow.ts ikennaokeke1996@gmail.com
```

**What this does:**
- Creates a Stripe checkout session
- Simulates the webhook event
- Triggers API key generation and email sending
- Verifies everything worked

---

## 📧 What to Check

### 1. Script Output
Should show:
- ✅ Webhook sent successfully
- ✅ Tenant found in database
- ✅ API key found in database

### 2. Email Inbox
Check `ikennaokeke1996@gmail.com` for:
- **Subject:** "Your Sinna API Key is Ready! 🎉"
- **Body:** Contains API key (starts with `sk_live_...`)

### 3. Render Logs
Check: https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg

Look for:
- `checkout.session.completed` event
- `API key email sent successfully`
- `Email sent successfully via Resend` (or SendGrid)

---

## 🔧 If Script Doesn't Work

### Manual Test Steps:

**1. Create Checkout Session:**
```bash
pnpm tsx scripts/create-live-checkout.ts
```

**2. Complete Payment:**
- Open checkout URL
- Use test card: `4242 4242 4242 4242`
- Enter your email
- Complete payment

**3. Check Email:**
- Wait 30-60 seconds
- Check inbox for API key

---

## 🆘 Troubleshooting

**Email not received?**
- Check spam folder
- Verify `RESEND_API_KEY` or `SENDGRID_API_KEY` is set in Render
- Check Render logs for email errors

**Webhook not working?**
- Verify `STRIPE_WEBHOOK_SECRET` is set correctly
- Check Stripe dashboard → Webhooks → Recent deliveries
- Verify webhook endpoint URL matches Render service URL

---

**Ready?** Run the test script above! 🚀

