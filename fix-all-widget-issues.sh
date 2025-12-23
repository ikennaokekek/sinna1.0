#!/bin/bash

# Fix All Widget Issues:
# 1. Production mode script loading failure (use local instead of CDN)
# 2. Developer mode missing theme switch, accent dial, and presets

set -e

echo "🔧 Fixing All Widget Issues..."
echo ""

# Run the fixes
echo "1️⃣ Fixing production mode..."
node fix-demo-production-mode.js

echo ""
echo "2️⃣ Fixing developer widget controls..."
node fix-dev-widget-controls.js

echo ""
echo "🔨 Rebuilding widgets..."
cd widget
npm install
npm run build

echo ""
echo "✨ All fixes applied and widgets rebuilt!"
echo ""
echo "Next: Run 'npm run preview' to test"

