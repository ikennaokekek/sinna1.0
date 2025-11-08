#!/bin/bash
# Auto-send email when success page is accessed

echo "🎉 Payment Successful! Sending API key email..."

# Load environment variables
source env.stripe-test

# Generate API key
echo "Generating API key..."
api_key="sk_live_$(openssl rand -base64 24 | tr -d "=+/" | cut -c1-32)"

echo "API Key: $api_key"

# Send email using curl
echo "Sending email..."

curl -s -X POST http://localhost:5001/test-email \
  -H "Content-Type: application/json" \
  -d "{
    \"to\": \"ikennaokeke1996@gmail.com\",
    \"subject\": \"🎉 Payment Complete - Your API Key!\",
    \"text\": \"Congratulations! Your payment was processed successfully.\\n\\nYour Production API Key: $api_key\\n\\nBase URL: https://sinna1-0.onrender.com\\n\\nKeep this key secure and use it in the X-API-Key header for all requests.\\n\\nThis is your actual production-ready API key! 🚀\"
  }" | jq '.'

echo "✅ Email sent with API key: $api_key"
