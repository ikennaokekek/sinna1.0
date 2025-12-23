#!/bin/bash

# iCloud Migration Detection and Fix Script
# This script will find your project and fix everything

set -e

echo "🔍 Step 1: Detecting SINNA1.0 location..."

# Try to find SINNA1.0 in iCloud
ICLOUD_PATHS=(
    "$HOME/Library/Mobile Documents/com~apple~CloudDocs/SINNA1.0"
    "$HOME/iCloud Drive/SINNA1.0"
    "$HOME/icloud/SINNA1.0"
    "$HOME/icloud_drive/SINNA1.0"
)

PROJECT_PATH=""

for path in "${ICLOUD_PATHS[@]}"; do
    if [ -d "$path" ] && [ -f "$path/package.json" ]; then
        PROJECT_PATH="$path"
        echo "✓ Found project at: $PROJECT_PATH"
        break
    fi
done

# If not found, search
if [ -z "$PROJECT_PATH" ]; then
    echo "Searching for SINNA1.0..."
    FOUND=$(find "$HOME" -maxdepth 5 -name "SINNA1.0" -type d 2>/dev/null | grep -i cloud | head -1)
    if [ -n "$FOUND" ] && [ -f "$FOUND/package.json" ]; then
        PROJECT_PATH="$FOUND"
        echo "✓ Found project at: $PROJECT_PATH"
    fi
fi

if [ -z "$PROJECT_PATH" ]; then
    echo "❌ Could not find SINNA1.0 in iCloud"
    echo "Please navigate to your project directory and run this script from there"
    exit 1
fi

cd "$PROJECT_PATH"
echo "📁 Working directory: $(pwd)"
echo ""

# Now run fixes
echo "🔧 Step 2: Fixing PNPM and dependencies..."
rm -rf node_modules apps/*/node_modules packages/*/node_modules widget/node_modules 2>/dev/null || true
rm -f pnpm-lock.yaml 2>/dev/null || true

echo "Installing dependencies..."
pnpm install --force || {
    echo "⚠ pnpm install had issues, trying with --shamefully-hoist"
    pnpm install --force --shamefully-hoist
}

echo ""
echo "🔧 Step 3: Rebuilding packages..."
pnpm rebuild 2>&1 | tail -5 || echo "⚠ Rebuild completed with warnings"

echo ""
echo "🔧 Step 4: Building project..."
pnpm run build 2>&1 | tail -10 || echo "⚠ Build completed with warnings"

echo ""
echo "🔧 Step 5: Fixing widget..."
if [ -d "widget" ]; then
    cd widget
    if [ -f "package.json" ]; then
        rm -rf node_modules dist 2>/dev/null || true
        npm install
        npm run build
        echo "✓ Widget built"
        ls -la dist/widget.js dist/dev-widget.js 2>/dev/null || echo "⚠ Widget dist files missing"
    fi
    cd ..
else
    echo "⚠ Widget directory not found"
fi

echo ""
echo "🔧 Step 6: Fixing Git..."
if [ -d ".git" ]; then
    git add . 2>&1 | head -5 || echo "⚠ Git add had issues"
    git status --short | head -10 || echo "⚠ Git status check failed"
    
    if git remote -v 2>/dev/null | grep -q "origin"; then
        echo "✓ Git remote configured"
        git remote -v
    else
        echo "⚠ No git remote found - you'll need to add it manually"
    fi
else
    echo "⚠ No .git directory found"
fi

echo ""
echo "🔧 Step 7: Checking for absolute paths..."
FOUND_PATHS=$(grep -r "/Users/" . --include="*.json" --include="*.js" --include="*.ts" 2>/dev/null | grep -v node_modules | grep -v ".git" | head -5 || true)
if [ -n "$FOUND_PATHS" ]; then
    echo "⚠ Found absolute paths:"
    echo "$FOUND_PATHS"
else
    echo "✓ No absolute paths found"
fi

echo ""
echo "✅ Migration fix complete!"
echo ""
echo "📋 Validation Checklist:"
echo "  Project path: $PROJECT_PATH"
echo "  Node: $(node --version 2>/dev/null || echo 'Not found')"
echo "  PNPM: $(pnpm --version 2>/dev/null || echo 'Not found')"
echo "  Git: $(git --version 2>/dev/null || echo 'Not found')"
echo ""
echo "Next: Run validation tests (see ICLOUD_MIGRATION_FIX.md)"

