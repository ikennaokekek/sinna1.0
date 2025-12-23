#!/bin/bash

echo "🔧 Applying SINNA Widget Fixes..."

# Update header text
sed -i '' 's/Sinna Accessibility Presets/SINNA 1.0/g' widget/src/SinnaPresetBase.js
sed -i '' 's/Select a preset to analyze your video/Accessibility, Automated/g' widget/src/SinnaPresetBase.js

# Fix script paths in demo (both dev and production)
sed -i '' 's|\.\./dist/dev-widget\.js|/dist/dev-widget.js|g' widget/demo/index.html
sed -i '' 's|\.\./dist/widget\.js|/dist/widget.js|g' widget/demo/index.html

# Fix production mode - use local instead of CDN
sed -i '' 's|https://cdn\.sinna\.site/widget\.js|/dist/widget.js|g' widget/demo/index.html

echo "✓ Header and script paths fixed"

# Rebuild widgets
cd widget || exit
echo "🔨 Building widgets..."

npm install
npm run build

echo "✨ All done!"
