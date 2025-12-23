#!/bin/bash

# Apply Widget Fixes and Rebuild
# Run this from your SINNA1.0 directory

set -e

echo "🔧 Applying Widget Fixes..."
echo ""

# Apply fixes
if [ -f "fix-widgets.js" ]; then
    node fix-widgets.js
else
    echo "❌ fix-widgets.js not found"
    exit 1
fi

echo ""
echo "🔨 Rebuilding Widget..."
echo ""

# Navigate to widget directory and build
if [ -d "widget" ]; then
    cd widget
    npm run build
    echo ""
    echo "✅ Build complete!"
    echo ""
    echo "To preview, run: npm run preview"
else
    echo "❌ widget directory not found"
    exit 1
fi

