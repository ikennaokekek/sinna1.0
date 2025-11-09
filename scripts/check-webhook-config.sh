#!/bin/bash
# Quick webhook configuration checker
# Run on Render Shell: bash scripts/check-webhook-config.sh

echo "=== STRIPE WEBHOOK CONFIGURATION ==="
echo ""
echo "STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:+✅ Set (${STRIPE_SECRET_KEY:0:20}...)}"
echo "STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET:+✅ Set (${STRIPE_WEBHOOK_SECRET:0:20}...)}"
echo ""
echo "NODE_ENV: ${NODE_ENV:-❌ Not set}"
echo "STRIPE_TESTING: ${STRIPE_TESTING:-❌ Not set}"
echo ""
echo "BASE_URL_PUBLIC: ${BASE_URL_PUBLIC:-❌ Not set}"
echo ""
echo "=== WEBHOOK ENDPOINT ==="
echo "Expected: https://sinna.site/webhooks/stripe"
echo ""
echo "=== NEXT STEPS ==="
if [ -z "$STRIPE_WEBHOOK_SECRET" ]; then
  echo "❌ STRIPE_WEBHOOK_SECRET is missing!"
  echo "   1. Go to: https://dashboard.stripe.com/webhooks"
  echo "   2. Add endpoint: https://sinna.site/webhooks/stripe"
  echo "   3. Select event: checkout.session.completed"
  echo "   4. Copy 'Signing secret' (starts with whsec_)"
  echo "   5. Add to Render: STRIPE_WEBHOOK_SECRET=<signing_secret>"
else
  echo "✅ STRIPE_WEBHOOK_SECRET is set"
  echo "   Verify it matches Stripe Dashboard → Webhooks → Your endpoint → Signing secret"
fi
