#!/bin/bash

# Helper script to create Stripe checkout with environment variables
# This script helps you set up environment variables before running the checkout script

echo "🔗 Stripe Checkout Link Creator"
echo "================================"
echo ""

# Check if .env file exists
if [ -f .env ]; then
    echo "📁 Loading environment variables from .env file..."
    export $(grep -v '^#' .env | xargs)
    echo "✅ Environment variables loaded"
    echo ""
fi

# Check required variables
MISSING_VARS=()

if [ -z "$STRIPE_SECRET_KEY" ]; then
    MISSING_VARS+=("STRIPE_SECRET_KEY")
fi

if [ -z "$STRIPE_STANDARD_PRICE_ID" ]; then
    MISSING_VARS+=("STRIPE_STANDARD_PRICE_ID")
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo "❌ Missing required environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "   - $var"
    done
    echo ""
    echo "💡 Options to set them:"
    echo ""
    echo "Option 1: Export in terminal (temporary):"
    echo "   export STRIPE_SECRET_KEY='sk_live_...'"
    echo "   export STRIPE_STANDARD_PRICE_ID='price_...'"
    echo ""
    echo "Option 2: Get from Render Dashboard:"
    echo "   1. Go to: https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg"
    echo "   2. Click 'Environment' tab"
    echo "   3. Copy STRIPE_SECRET_KEY and STRIPE_STANDARD_PRICE_ID values"
    echo "   4. Export them:"
    echo "      export STRIPE_SECRET_KEY='<value-from-render>'"
    echo "      export STRIPE_STANDARD_PRICE_ID='<value-from-render>'"
    echo ""
    echo "Option 3: Create .env file:"
    echo "   cp env.example .env"
    echo "   # Edit .env and add your values"
    echo ""
    exit 1
fi

echo "✅ All required environment variables are set"
echo ""
echo "🔍 Configuration:"
echo "   STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:0:20}... (${#STRIPE_SECRET_KEY} chars)"
echo "   STRIPE_STANDARD_PRICE_ID: $STRIPE_STANDARD_PRICE_ID"
echo "   BASE_URL_PUBLIC: ${BASE_URL_PUBLIC:-https://sinna.site}"
echo ""

# Run the checkout script
echo "🚀 Creating checkout session..."
echo ""
pnpm tsx scripts/create-live-checkout.ts

