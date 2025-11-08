#!/bin/bash

# Load the test environment variables
source env.stripe-test

# Run the application with the loaded environment
echo "🚀 Starting application with test environment..."
echo "✅ Environment variables loaded:"
echo "   - REDIS_URL: $REDIS_URL"
echo "   - BASE_URL: $BASE_URL"
echo "   - STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:0:20}..."
echo "   - STRIPE_STANDARD_PRICE_ID: $STRIPE_STANDARD_PRICE_ID"
echo "   - RESEND_API_KEY: ${RESEND_API_KEY:0:20}..."
echo "   - SENDGRID_API_KEY: ${SENDGRID_API_KEY:0:20}..."
echo "   - NOTIFY_FROM_EMAIL: $NOTIFY_FROM_EMAIL"
echo ""

# Run the command passed as arguments
exec "$@"
