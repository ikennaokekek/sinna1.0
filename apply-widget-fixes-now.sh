#!/bin/bash

# Widget Fixes - Auto-Apply Script
# This script will find and fix all three issues

set -e

echo "🔧 Applying Widget Fixes..."
echo ""

# Find project directory
PROJECT_DIR=""
if [ -f "widget/src/SinnaPresetBase.js" ]; then
    PROJECT_DIR="."
elif [ -f "../widget/src/SinnaPresetBase.js" ]; then
    PROJECT_DIR=".."
else
    # Try to find in iCloud
    FOUND=$(find ~/Library/Mobile\ Documents/com~apple~CloudDocs -name "SinnaPresetBase.js" 2>/dev/null | head -1)
    if [ -n "$FOUND" ]; then
        PROJECT_DIR=$(dirname "$(dirname "$(dirname "$FOUND")")")
        echo "Found project at: $PROJECT_DIR"
    else
        echo "❌ Could not find widget files"
        echo "Please run this from your SINNA1.0 directory"
        exit 1
    fi
fi

cd "$PROJECT_DIR"

echo "📁 Working directory: $(pwd)"
echo ""

# Fix 1: Header Text
echo "✅ Fix 1: Updating header text..."
if [ -f "widget/src/SinnaPresetBase.js" ]; then
    # Create backup
    cp widget/src/SinnaPresetBase.js widget/src/SinnaPresetBase.js.bak
    
    # Replace header text
    sed -i '' 's/Sinna Accessibility Presets/SINNA 1.0/g' widget/src/SinnaPresetBase.js
    sed -i '' 's/Select a preset to analyze your video/Accessibility, Automated/g' widget/src/SinnaPresetBase.js
    
    echo "✓ Header text updated"
else
    echo "⚠ widget/src/SinnaPresetBase.js not found"
fi
echo ""

# Fix 2: Demo Paths
echo "✅ Fix 2: Fixing demo paths..."
if [ -f "widget/demo/index.html" ]; then
    # Create backup
    cp widget/demo/index.html widget/demo/index.html.bak
    
    # Replace paths
    sed -i '' "s|'../dist/dev-widget.js'|'/dist/dev-widget.js'|g" widget/demo/index.html
    sed -i '' 's|"../dist/dev-widget.js"|"/dist/dev-widget.js"|g' widget/demo/index.html
    
    echo "✓ Demo paths fixed"
else
    echo "⚠ widget/demo/index.html not found"
fi
echo ""

# Fix 3: Verify Dev Widget
echo "✅ Fix 3: Verifying dev widget controls..."
if [ -f "widget/src/SinnaPresetDev.js" ]; then
    if grep -q "renderDeveloperUI\|dev-theme-toggle\|dev-accent-color" widget/src/SinnaPresetDev.js; then
        echo "✓ Dev widget controls present"
    else
        echo "⚠ Dev widget controls may be missing"
        echo "  Check widget/src/SinnaPresetDev.js has renderDeveloperUI() method"
    fi
else
    echo "⚠ widget/src/SinnaPresetDev.js not found"
fi
echo ""

echo "✅ Fixes applied! Backup files created with .bak extension"
echo ""
echo "Next steps:"
echo "  cd widget"
echo "  npm run build"
echo "  npm run preview"

