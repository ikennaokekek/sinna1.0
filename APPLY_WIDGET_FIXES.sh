#!/bin/bash

# Widget Fixes Application Script
# Run this from your SINNA1.0/widget directory

set -e

echo "🔧 Applying Widget Fixes..."
echo ""

# Check we're in the right place
if [ ! -f "src/SinnaPresetBase.js" ]; then
    echo "❌ Error: src/SinnaPresetBase.js not found"
    echo "Please run this from the widget/ directory"
    exit 1
fi

echo "✅ Fix 1: Updating header text..."

# Fix header in SinnaPresetBase.js
sed -i.bak 's/Sinna Accessibility Presets/SINNA 1.0/g' src/SinnaPresetBase.js
sed -i.bak 's/Select a preset to analyze your video/Accessibility, Automated/g' src/SinnaPresetBase.js

echo "✓ Header text updated"
echo ""

echo "✅ Fix 2: Fixing demo paths..."

# Fix paths in demo/index.html
if [ -f "demo/index.html" ]; then
    sed -i.bak "s|'../dist/dev-widget.js'|'/dist/dev-widget.js'|g" demo/index.html
    sed -i.bak 's|"../dist/dev-widget.js"|"/dist/dev-widget.js"|g' demo/index.html
    echo "✓ Demo paths fixed"
else
    echo "⚠ demo/index.html not found"
fi
echo ""

echo "✅ Fix 3: Verifying dev widget controls..."

# Check if SinnaPresetDev.js has developer UI
if [ -f "src/SinnaPresetDev.js" ]; then
    if grep -q "renderDeveloperUI\|dev-theme-toggle\|dev-accent-color" src/SinnaPresetDev.js; then
        echo "✓ Dev widget controls present"
    else
        echo "⚠ Dev widget controls may be missing - check src/SinnaPresetDev.js"
    fi
else
    echo "⚠ src/SinnaPresetDev.js not found"
fi
echo ""

echo "✅ Rebuilding widget..."
npm run build

echo ""
echo "✅ Fixes applied! Backup files created with .bak extension"
echo ""
echo "Next: Run 'npm run preview' to test"

