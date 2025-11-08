#!/bin/bash
# Generate a fresh Stripe checkout link

echo "🧪 Generating Fresh Stripe Checkout Link"
echo "========================================"

# Load environment variables
source env.stripe-test

echo "✅ Environment loaded:"
echo "   STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:0:20}..."
echo "   STRIPE_STANDARD_PRICE_ID: $STRIPE_STANDARD_PRICE_ID"
echo ""

# Create checkout session directly with Stripe API
echo "🔗 Creating Stripe Checkout Session..."

response=$(curl -s -X POST https://api.stripe.com/v1/checkout/sessions \
  -u "$STRIPE_SECRET_KEY:" \
  -d "payment_method_types[]=card" \
  -d "line_items[0][price]=$STRIPE_STANDARD_PRICE_ID" \
  -d "line_items[0][quantity]=1" \
  -d "mode=subscription" \
  -d "success_url=http://localhost:3000/success" \
  -d "cancel_url=http://localhost:3000/cancel" \
  -d "customer_email=ikennaokeke1996@gmail.com" \
  -d "expires_at=$(($(date +%s) + 3600))")

checkout_url=$(echo "$response" | jq -r '.url')

if [ "$checkout_url" != "null" ] && [ "$checkout_url" != "" ]; then
  echo "✅ Checkout session created successfully!"
  echo ""
  echo "🎯 Your Test Checkout Link:"
  echo "$checkout_url"
  echo ""
  echo "📋 Test Instructions:"
  echo "1. Click the link above"
  echo "2. Use test card: 4242 4242 4242 4242"
  echo "3. Expiry: 12/25, CVC: 123"
  echo "4. Complete payment"
  echo "5. You'll be redirected to success page"
  echo "6. Success page will auto-generate API key and send email"
else
  echo "❌ Failed to create checkout session"
  echo "Response: $response"
fi
