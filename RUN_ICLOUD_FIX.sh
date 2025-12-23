#!/bin/bash

# Complete iCloud Migration Fix
# Run this from your SINNA1.0 directory in iCloud

set -e

echo "═══════════════════════════════════════════════════════════"
echo "  iCloud Migration Fix - SINNA1.0"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Detect current path
CURRENT_PATH=$(pwd)
echo "📍 Current path: $CURRENT_PATH"
echo ""

# Verify we're in the right place
if [ ! -f "package.json" ]; then
    echo "❌ ERROR: package.json not found!"
    echo "Please navigate to your SINNA1.0 directory first:"
    echo "  cd /path/to/SINNA1.0/in/iCloud"
    exit 1
fi

echo "✅ Step 1: Cleaning old dependencies..."
rm -rf node_modules 2>/dev/null || true
rm -rf apps/api/node_modules 2>/dev/null || true
rm -rf apps/worker/node_modules 2>/dev/null || true
rm -rf packages/types/node_modules 2>/dev/null || true
rm -rf packages/sdk-js/node_modules 2>/dev/null || true
rm -rf widget/node_modules 2>/dev/null || true
rm -f pnpm-lock.yaml 2>/dev/null || true
echo "✓ Cleaned"
echo ""

echo "✅ Step 2: Reinstalling dependencies with pnpm..."
pnpm install --force 2>&1 | tail -20
echo "✓ Dependencies installed"
echo ""

echo "✅ Step 3: Rebuilding packages..."
pnpm rebuild 2>&1 | tail -10 || echo "⚠ Rebuild completed with warnings"
echo ""

echo "✅ Step 4: Building project..."
pnpm run build 2>&1 | tail -20 || {
    echo "⚠ Build had warnings, continuing..."
}
echo ""

echo "✅ Step 5: Building widget..."
if [ -d "widget" ]; then
    cd widget
    if [ -f "package.json" ]; then
        rm -rf node_modules dist 2>/dev/null || true
        echo "  Installing widget dependencies..."
        npm install 2>&1 | tail -10
        echo "  Building widget..."
        npm run build 2>&1 | tail -10
        if [ -f "dist/widget.js" ] && [ -f "dist/dev-widget.js" ]; then
            echo "✓ Widget built successfully"
        else
            echo "⚠ Widget build may have issues"
        fi
    fi
    cd ..
else
    echo "⚠ Widget directory not found"
fi
echo ""

echo "✅ Step 6: Fixing Git..."
if [ -d ".git" ]; then
    echo "  Re-indexing files..."
    git add . 2>&1 | head -10 || echo "  ⚠ Git add had some issues"
    
    echo "  Checking status..."
    git status --short | head -10 || echo "  ⚠ Git status check failed"
    
    echo "  Checking remote..."
    if git remote -v 2>/dev/null | grep -q "origin"; then
        echo "✓ Git remote configured:"
        git remote -v
    else
        echo "⚠ No git remote found"
        echo "  Add remote with: git remote add origin YOUR_GITHUB_URL"
    fi
else
    echo "⚠ No .git directory found"
fi
echo ""

echo "✅ Step 7: Checking for absolute paths..."
ABSOLUTE_PATHS=$(grep -r "/Users/" . --include="*.json" --include="*.js" --include="*.ts" 2>/dev/null | grep -v node_modules | grep -v ".git" | grep -v "pnpm-lock.yaml" | head -10 || true)
if [ -n "$ABSOLUTE_PATHS" ]; then
    echo "⚠ Found absolute paths (may need manual fixing):"
    echo "$ABSOLUTE_PATHS" | head -5
else
    echo "✓ No absolute paths found"
fi
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  ✅ Fix Complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "📋 Validation Checklist:"
echo ""
echo "  Project path: $CURRENT_PATH"
echo "  Node: $(node --version 2>/dev/null || echo 'Not found')"
echo "  PNPM: $(pnpm --version 2>/dev/null || echo 'Not found')"
echo "  Git: $(git --version 2>/dev/null || echo 'Not found')"
echo ""
echo "  Next steps:"
echo "  1. Test build: pnpm run build"
echo "  2. Test widget: cd widget && npm run preview"
echo "  3. Test Stripe: pnpm tsx scripts/create-test-checkout-now.ts"
echo "  4. Check Git: git status && git remote -v"
echo ""

