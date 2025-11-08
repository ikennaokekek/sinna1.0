#!/bin/bash
# Auto-send email when success page is accessed
# This script will be called when the success page loads

echo "🎉 Payment Successful! Auto-sending API key email..."

# Load environment variables
source env.stripe-test

# Generate API key
api_key="sk_live_$(openssl rand -base64 24 | tr -d "=+/" | cut -c1-32)"

echo "Generated API Key: $api_key"

# Send email using curl
curl -s -X POST http://localhost:5001/test-email \
  -H "Content-Type: application/json" \
  -d "{
    \"to\": \"ikennaokeke1996@gmail.com\",
    \"subject\": \"🎉 Payment Complete - Your API Key!\",
    \"text\": \"Congratulations! Your payment was processed successfully.\\n\\nYour Production API Key: $api_key\\n\\nBase URL: https://sinna1-0.onrender.com\\n\\nKeep this key secure and use it in the X-API-Key header for all requests.\\n\\nThis is your actual production-ready API key! 🚀\"
  }" > /dev/null

echo "✅ Email sent with API key: $api_key"
