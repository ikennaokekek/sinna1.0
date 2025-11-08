#!/bin/bash

# Test Email Functionality
echo "📧 Testing Email Service"
echo "======================"

# Load test environment
source env.stripe-test

echo "✅ Environment loaded:"
echo "   RESEND_API_KEY: ${RESEND_API_KEY:0:20}..."
echo "   SENDGRID_API_KEY: ${SENDGRID_API_KEY:0:20}..."
echo "   NOTIFY_FROM_EMAIL: $NOTIFY_FROM_EMAIL"
echo ""

# Test 1: Check email service status
echo "🔍 Test 1: Check Email Service Status"
echo "------------------------------------"

curl -s http://localhost:4000/email-status | jq '.' 2>/dev/null || echo "Server not running on port 4000"

echo ""

# Test 2: Send test email
echo "📤 Test 2: Send Test Email"
echo "-------------------------"

EMAIL_RESPONSE=$(curl -s -X POST http://localhost:4000/test-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ikennaokeke1996@gmail.com",
    "subject": "🧪 SINNA API Email Test",
    "text": "✅ Success! Your SINNA API can send emails now.\n\nThis test was sent from your local development environment.\n\nTimestamp: $(date)"
  }')

echo "Email response:"
echo "$EMAIL_RESPONSE" | jq '.' 2>/dev/null || echo "$EMAIL_RESPONSE"
echo ""

# Test 3: Send email with custom content
echo "📤 Test 3: Send Custom Email"
echo "---------------------------"

CUSTOM_RESPONSE=$(curl -s -X POST http://localhost:4000/test-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ikennaokeke1996@gmail.com",
    "subject": "🎉 API Key Delivery Test",
    "text": "Your API Key: sk_test_1234567890abcdef\n\nBase URL: http://localhost:4000\n\nKeep this key secure and use it in the X-API-Key header for all requests.\n\nHappy coding! 🚀"
  }')

echo "Custom email response:"
echo "$CUSTOM_RESPONSE" | jq '.' 2>/dev/null || echo "$CUSTOM_RESPONSE"
echo ""

echo "📋 Next Steps:"
echo "1. Check your email (ikennaokeke1996@gmail.com) for the test emails"
echo "2. Verify the emails were sent from noreply@sinna.site"
echo "3. Check server logs for email service details"
echo ""
echo "💡 Note: If the server isn't running, start it with:"
echo "   source env.stripe-test && npm run dev"
