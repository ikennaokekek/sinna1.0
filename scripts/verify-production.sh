#!/bin/bash
# Production Verification Script
# Runs auto-healing QA tests in production environment

set -e

echo "🚀 Starting Production QA Verification"
echo "======================================"
echo ""

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Set production API URL
export E2E_BASE_URL="${E2E_BASE_URL:-https://sinna.site}"
export API_BASE_URL="${API_BASE_URL:-https://sinna.site}"
export TEST_API_KEY="${TEST_API_KEY:-${API_KEY}}"
export TEST_VIDEO_URL="${TEST_VIDEO_URL:-https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4}"

echo "📍 API Base URL: $E2E_BASE_URL"
echo "🎬 Test Video: $TEST_VIDEO_URL"
echo ""

# Check if API is accessible
echo "🔍 Verifying API is accessible..."
if ! curl -s -f "${E2E_BASE_URL}/health" > /dev/null; then
  echo "❌ ERROR: API is not accessible at ${E2E_BASE_URL}"
  echo "   Please verify the API is running and accessible"
  exit 1
fi
echo "✅ API is accessible"
echo ""

# Run auto-healing tests
echo "🧪 Running auto-healing QA tests..."
echo "   This will test all 8 video transformation presets"
echo ""

npm run test:heal

echo ""
echo "✅ Production verification complete!"
echo ""
echo "📊 Check results in: tests/reports/autoheal-report.md"

