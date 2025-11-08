#!/bin/bash

# Test Stripe Subscription Flow
echo "🧪 Testing Stripe Subscription Flow"
echo "=================================="

# Load test environment
source env.stripe-test

echo "✅ Environment loaded:"
echo "   STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:0:20}..."
echo "   STRIPE_STANDARD_PRICE_ID: $STRIPE_STANDARD_PRICE_ID"
echo "   RESEND_API_KEY: ${RESEND_API_KEY:0:20}..."
echo "   NOTIFY_FROM_EMAIL: $NOTIFY_FROM_EMAIL"
echo ""

# Test 1: Create a test checkout session using Stripe CLI
echo "🔗 Test 1: Creating Stripe Checkout Session"
echo "-------------------------------------------"

# Create a test checkout session
CHECKOUT_SESSION=$(curl -s -X POST https://api.stripe.com/v1/checkout/sessions \
  -u "$STRIPE_SECRET_KEY:" \
  -d "mode=subscription" \
  -d "line_items[0][price]=$STRIPE_STANDARD_PRICE_ID" \
  -d "line_items[0][quantity]=1" \
  -d "success_url=http://localhost:3000/success" \
  -d "cancel_url=http://localhost:3000/cancel" \
  -d "customer_email=test@example.com")

echo "Checkout session created:"
echo "$CHECKOUT_SESSION" | jq '.' 2>/dev/null || echo "$CHECKOUT_SESSION"
echo ""

# Extract session URL
SESSION_URL=$(echo "$CHECKOUT_SESSION" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
if [ -n "$SESSION_URL" ]; then
    echo "✅ Checkout URL: $SESSION_URL"
    echo ""
    echo "🌐 Open this URL in your browser to complete the test payment:"
    echo "   $SESSION_URL"
    echo ""
    echo "📧 After completing payment, check the webhook logs for:"
    echo "   - API key generation"
    echo "   - Email sending (will log to console if no email service)"
    echo ""
else
    echo "❌ Failed to create checkout session"
    echo "Response: $CHECKOUT_SESSION"
fi

echo ""
echo "🔍 Test 2: Simulate Webhook Event"
echo "--------------------------------"

# Create a test webhook payload
WEBHOOK_PAYLOAD='{
  "id": "evt_test_webhook",
  "object": "event",
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "id": "cs_test_session",
      "object": "checkout.session",
      "customer_details": {
        "email": "test@example.com"
      },
      "payment_status": "paid"
    }
  }
}'

echo "Webhook payload created for testing:"
echo "$WEBHOOK_PAYLOAD" | jq '.' 2>/dev/null || echo "$WEBHOOK_PAYLOAD"
echo ""

echo "📋 Next Steps:"
echo "1. Open the checkout URL above"
echo "2. Complete the test payment"
echo "3. Check your server logs for webhook processing"
echo "4. Verify API key generation and email sending"
echo ""
echo "💡 Note: This uses Stripe test mode, so no real money will be charged!"
