#!/bin/bash
set -e

API_BASE_URL="${API_BASE_URL:-https://sinna1-0.onrender.com}"
TEST_VIDEO_URL="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"

echo "🧪 End-to-End Integration Test"
echo "================================"
echo ""

# Get API key from database
echo "1️⃣  Getting API key from database..."
API_KEY_HASH=$(psql "$DATABASE_URL" -t -c "SELECT key_hash FROM api_keys LIMIT 1;" | tr -d ' ')
if [ -z "$API_KEY_HASH" ]; then
    echo "❌ No API key found in database"
    exit 1
fi
echo "✅ Found API key hash: ${API_KEY_HASH:0:20}..."

# Note: We need the actual API key, not the hash
# For testing, we'll need to use a known test key or create one
echo "⚠️  Note: Need actual API key value (not hash) for testing"
echo ""

# Test health endpoint
echo "2️⃣  Testing health endpoint..."
HEALTH=$(curl -s "$API_BASE_URL/health" || echo "failed")
if [ "$HEALTH" = "failed" ]; then
    echo "❌ Health check failed"
else
    echo "✅ Health endpoint responded"
fi
echo ""

echo "Test script ready. Need API key value to proceed."
