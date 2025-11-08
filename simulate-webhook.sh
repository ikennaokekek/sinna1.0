#!/bin/bash

# Simulate Stripe Webhook for Local Testing
echo "🔔 Simulating Stripe Webhook"
echo "============================"

# Load test environment
source env.stripe-test

echo "✅ Environment loaded:"
echo "   STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:0:20}..."
echo "   STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET:0:20}..."
echo ""

# Create a test webhook payload
WEBHOOK_PAYLOAD='{
  "id": "evt_test_webhook_local",
  "object": "event",
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "id": "cs_test_local_session",
      "object": "checkout.session",
      "customer_details": {
        "email": "ikennaokeke1996@gmail.com"
      },
      "payment_status": "paid",
      "amount_total": 200000,
      "currency": "usd"
    }
  }
}'

echo "📤 Sending webhook to local server..."
echo "Payload:"
echo "$WEBHOOK_PAYLOAD" | jq '.' 2>/dev/null || echo "$WEBHOOK_PAYLOAD"
echo ""

# Send webhook to local server
WEBHOOK_RESPONSE=$(curl -s -X POST http://localhost:4000/webhooks/stripe \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=1234567890,v1=dummy_signature" \
  -d "$WEBHOOK_PAYLOAD")

echo "📥 Webhook response:"
echo "$WEBHOOK_RESPONSE" | jq '.' 2>/dev/null || echo "$WEBHOOK_RESPONSE"
echo ""

echo "📧 Check your email: ikennaokeke1996@gmail.com"
echo "🎉 The webhook should have:"
echo "   1. Generated a new API key"
echo "   2. Created a tenant in the database"
echo "   3. Sent an email with the API key"
echo ""
echo "💡 Note: This simulates what happens after a real Stripe payment!"
