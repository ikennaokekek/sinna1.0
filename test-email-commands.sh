# 📧 Email Testing Commands
# ========================

# Test 1: Check email service status
echo "🔍 Check Email Service Status:"
curl -s http://localhost:4000/email-status | jq '.'

# Test 2: Send test email
echo "📤 Send Test Email:"
curl -X POST http://localhost:4000/test-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ikennaokeke1996@gmail.com",
    "subject": "🧪 SINNA API Email Test",
    "text": "✅ Success! Your SINNA API can send emails now.\n\nThis test was sent from your local development environment.\n\nTimestamp: '$(date)'"
  }' | jq '.'

# Test 3: Send API key email (simulating subscription)
echo "🎉 Send API Key Email:"
curl -X POST http://localhost:4000/test-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ikennaokeke1996@gmail.com",
    "subject": "Your Sinna API Key is Ready! 🎉",
    "text": "Your API Key: sk_test_1234567890abcdef\n\nBase URL: http://localhost:4000\n\nKeep this key secure and use it in the X-API-Key header for all requests.\n\nHappy coding! 🚀"
  }' | jq '.'

echo ""
echo "📋 Check your email: ikennaokeke1996@gmail.com"
echo "📧 From: noreply@sinna.site"
