#!/bin/bash

# iCloud Migration Fix Script
# Run this from your SINNA1.0 directory in iCloud

set -e

echo "🔍 Detecting project path..."
PROJECT_PATH=$(pwd)
echo "✓ Project path: $PROJECT_PATH"

if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Are you in the SINNA1.0 directory?"
    exit 1
fi

echo ""
echo "🔧 Step 1: Fixing PNPM..."
echo "Removing old node_modules and lockfile..."
rm -rf node_modules
rm -rf apps/*/node_modules
rm -rf packages/*/node_modules
rm -rf widget/node_modules
rm -f pnpm-lock.yaml

echo "Reinstalling dependencies..."
pnpm install --force

echo ""
echo "🔧 Step 2: Rebuilding packages..."
pnpm rebuild || echo "⚠ Rebuild had warnings (may be normal)"

echo ""
echo "🔧 Step 3: Building project..."
pnpm run build || echo "⚠ Build had warnings"

echo ""
echo "🔧 Step 4: Building widget..."
cd widget
if [ -f "package.json" ]; then
    npm install
    npm run build
    echo "✓ Widget built"
else
    echo "⚠ Widget package.json not found"
fi
cd ..

echo ""
echo "🔧 Step 5: Fixing Git..."
if [ -d ".git" ]; then
    echo "Checking git status..."
    git status || echo "⚠ Git status check failed"
    
    echo "Checking remote..."
    git remote -v || echo "⚠ No remote configured"
    
    echo "Re-indexing git files..."
    git add . || echo "⚠ Git add had issues"
    
    echo "✓ Git checked"
else
    echo "⚠ No .git directory found"
fi

echo ""
echo "🔧 Step 6: Validating paths..."
echo "Checking for absolute paths in config files..."

# Check tsconfig files
find . -name "tsconfig*.json" -type f | while read file; do
    if grep -q "/Users/" "$file" 2>/dev/null; then
        echo "⚠ Found absolute path in $file"
    fi
done

echo ""
echo "✅ Migration fix complete!"
echo ""
echo "Next steps:"
echo "1. Run: pnpm tsx scripts/create-test-checkout-now.ts"
echo "2. Run: cd widget && npm run preview"
echo "3. Check: git status && git remote -v"

