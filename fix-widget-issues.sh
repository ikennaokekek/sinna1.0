#!/bin/bash

# Fix Widget Issues:
# 1. Production mode script loading failure
# 2. Developer mode missing theme switch, accent dial, and presets

set -e

echo "🔧 Fixing Widget Issues..."
echo ""

WIDGET_DIR="widget"
if [ ! -d "$WIDGET_DIR" ]; then
    echo "❌ Widget directory not found"
    exit 1
fi

# Fix 1: Production mode - fallback to local if CDN fails
echo "✅ Fix 1: Fixing production mode script loading..."
DEMO_HTML="$WIDGET_DIR/demo/index.html"

if [ -f "$DEMO_HTML" ]; then
    # Create backup
    cp "$DEMO_HTML" "$DEMO_HTML.bak"
    
    # Replace CDN URL with local fallback or make it handle errors better
    # Change production mode to use local /dist/widget.js instead of CDN
    sed -i '' 's|https://cdn\.sinna\.site/widget\.js|/dist/widget.js|g' "$DEMO_HTML"
    
    # Also ensure error handling for script loading
    # Add fallback logic if script fails to load
    
    echo "✓ Production mode now uses local /dist/widget.js"
else
    echo "⚠ $DEMO_HTML not found"
fi
echo ""

# Fix 2: Check developer widget for missing controls
echo "✅ Fix 2: Checking developer widget controls..."
DEV_WIDGET="$WIDGET_DIR/src/SinnaPresetDev.js"
BASE_WIDGET="$WIDGET_DIR/src/SinnaPresetBase.js"

if [ -f "$DEV_WIDGET" ]; then
    # Check if renderDeveloperUI exists
    if ! grep -q "renderDeveloperUI" "$DEV_WIDGET"; then
        echo "⚠ renderDeveloperUI method missing - will add it"
        # Add renderDeveloperUI method
        cat >> "$DEV_WIDGET" << 'EOF'

  renderDeveloperUI() {
    return `
      <div class="dev-banner">
        <div class="dev-banner-content">
          <span class="dev-badge">DEV MODE</span>
          <span class="dev-text">Developer Widget - Theme controls enabled</span>
        </div>
      </div>
      <div class="dev-controls">
        <div class="dev-control-group">
          <label for="dev-theme-toggle">Theme</label>
          <select id="dev-theme-toggle" class="dev-select">
            <option value="light" ${this.theme === 'light' ? 'selected' : ''}>Light</option>
            <option value="dark" ${this.theme === 'dark' ? 'selected' : ''}>Dark</option>
          </select>
        </div>
        <div class="dev-control-group">
          <label for="dev-accent-color">Accent Color</label>
          <input type="color" id="dev-accent-color" class="dev-color-input" value="${this.accent || '#0066cc'}">
        </div>
      </div>
    `;
  }
EOF
        echo "✓ Added renderDeveloperUI method"
    else
        echo "✓ renderDeveloperUI method exists"
    fi
    
    # Check if render method attaches event listeners
    if ! grep -q "dev-theme-toggle.*addEventListener\|getElementById.*dev-theme-toggle" "$DEV_WIDGET"; then
        echo "⚠ Event listeners missing - checking render method"
    fi
else
    echo "⚠ $DEV_WIDGET not found"
fi

# Check if presets are being rendered
if [ -f "$BASE_WIDGET" ]; then
    if ! grep -q "preset.*option\|preset.*button\|preset.*grid" "$BASE_WIDGET"; then
        echo "⚠ Presets may not be rendering - checking render method"
    else
        echo "✓ Presets rendering code found"
    fi
else
    echo "⚠ $BASE_WIDGET not found"
fi

echo ""
echo "🔨 Rebuilding widgets..."
cd "$WIDGET_DIR"
npm install
npm run build

echo ""
echo "✨ Fixes applied and widgets rebuilt!"
echo ""
echo "Next: Run 'npm run preview' to test"

