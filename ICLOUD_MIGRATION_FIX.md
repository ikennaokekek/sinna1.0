# iCloud Migration - Complete Fix Guide

## 🎯 Overview

Your project has been moved to iCloud Drive. This guide will help you:
1. Find the new path
2. Fix all broken build systems
3. Restore Git functionality
4. Validate everything works

---

## 📍 Step 1: Find Your New Project Path

Run these commands to locate SINNA1.0 in iCloud:

```bash
# Method 1: Search in standard iCloud location
find ~/Library/Mobile\ Documents/com~apple~CloudDocs -name "SINNA1.0" -type d 2>/dev/null

# Method 2: Check common iCloud paths
ls -la ~/iCloud\ Drive/SINNA1.0 2>/dev/null
ls -la ~/icloud/SINNA1.0 2>/dev/null

# Method 3: Search entire home directory
find ~ -maxdepth 5 -name "SINNA1.0" -type d 2>/dev/null | grep -i cloud
```

**Once found, note the full path and navigate to it:**
```bash
cd "/path/to/SINNA1.0/in/iCloud"
```

---

## 🔧 Step 2: Fix Build Systems

### 2.1 Clean and Reinstall Dependencies

```bash
# Navigate to project
cd "/path/to/SINNA1.0/in/iCloud"

# Remove all node_modules (symlinks break after move)
rm -rf node_modules
rm -rf apps/*/node_modules
rm -rf packages/*/node_modules
rm -rf widget/node_modules

# Remove lockfile (will be regenerated)
rm -f pnpm-lock.yaml

# Reinstall everything
pnpm install --force
```

### 2.2 Rebuild Packages

```bash
# Rebuild all packages
pnpm rebuild

# Build the project
pnpm run build
```

### 2.3 Fix Widget Build

```bash
cd widget

# Reinstall widget dependencies
npm install

# Build widget
npm run build

# Verify dist files exist
ls -la dist/widget.js dist/dev-widget.js

cd ..
```

---

## 🔧 Step 3: Fix Git

### 3.1 Check Git Status

```bash
# Check if git still works
git status

# Check remote
git remote -v
```

### 3.2 Fix Git if Broken

If git shows errors:

```bash
# Re-index all files
git add .

# Check status again
git status

# If remote is missing, add it back
# (Replace with your actual GitHub URL)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# Or if remote exists but is wrong:
git remote set-url origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# Verify remote
git remote -v
```

### 3.3 Test Git Push

```bash
# Make a test commit
git add .
git commit -m "Fix: iCloud migration paths"

# Test push (use --dry-run first)
git push --dry-run origin main

# If dry-run works, push for real
git push origin main
```

---

## 🔧 Step 4: Fix TypeScript Configs

Check and fix any absolute paths in tsconfig files:

```bash
# Find all tsconfig files
find . -name "tsconfig*.json" -type f

# Check each for absolute paths
grep -r "/Users/" . --include="tsconfig*.json" || echo "No absolute paths found"
```

If you find absolute paths, edit those files and replace with relative paths.

---

## 🔧 Step 5: Fix Widget Paths

### 5.1 Check Widget Build Script

```bash
cd widget
cat build.js | grep -E "(path|resolve|__dirname)" || echo "No path issues"
cd ..
```

### 5.2 Fix Demo HTML Paths

The demo HTML should use relative paths:
- `../dist/dev-widget.js` (for dev widget)
- `https://cdn.sinna.site/widget.js` (for production)

Verify these are correct in `widget/demo/index.html`.

---

## ✅ Step 6: Validate Everything

### 6.1 Test Stripe Script

```bash
# Test Stripe checkout script
pnpm tsx scripts/create-test-checkout-now.ts

# If errors about .env, check:
ls -la .env
# If missing, copy from env.example
```

### 6.2 Test Widget Demo

```bash
cd widget
npm run preview

# Should start server on http://localhost:8080
# Open in browser and verify widget loads
```

### 6.3 Verify Build Outputs

```bash
# Check API build
ls -la apps/api/dist/

# Check worker build
ls -la apps/worker/dist/

# Check widget builds
ls -la widget/dist/widget.js widget/dist/dev-widget.js
```

---

## 🚨 Common Issues & Fixes

### Issue: "pnpm store path not found"
```bash
# Reset pnpm store
pnpm store prune
pnpm install --force
```

### Issue: "Module not found" errors
```bash
# Clean install
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

### Issue: "Git remote not found"
```bash
# Add remote back
git remote add origin YOUR_GITHUB_URL
git remote -v
```

### Issue: "Widget demo 404"
```bash
# Rebuild widget
cd widget
npm run build
cd ..

# Check dist files exist
ls -la widget/dist/
```

### Issue: "TypeScript path errors"
```bash
# Check tsconfig files for absolute paths
grep -r "/Users/" . --include="tsconfig*.json"

# Replace absolute paths with relative paths
```

---

## 📋 Final Validation Checklist

Run through this checklist:

```bash
# 1. Project path detected
pwd
# Should show iCloud path

# 2. Node/Pnpm OK
node --version
pnpm --version

# 3. Dependencies installed
test -d node_modules && echo "✓ node_modules exists" || echo "✗ Missing"

# 4. Build OK
pnpm run build
# Should complete without errors

# 5. Dist files OK
test -f widget/dist/widget.js && echo "✓ widget.js" || echo "✗ Missing"
test -f widget/dist/dev-widget.js && echo "✓ dev-widget.js" || echo "✗ Missing"

# 6. Git OK
git status
git remote -v
# Should show clean status and remote

# 7. Stripe script OK
pnpm tsx scripts/create-test-checkout-now.ts --help || echo "Script exists"

# 8. Demo OK
cd widget && npm run preview &
# Should start server
```

---

## 🎯 Quick Fix Script

Save this as `fix-all.sh` and run it:

```bash
#!/bin/bash
set -e

echo "🔧 Fixing iCloud migration..."

# Clean
rm -rf node_modules apps/*/node_modules packages/*/node_modules widget/node_modules
rm -f pnpm-lock.yaml

# Reinstall
pnpm install --force
pnpm rebuild
pnpm run build

# Fix widget
cd widget
npm install
npm run build
cd ..

# Fix git
git add .
git status

echo "✅ Fix complete! Run validation checklist."
```

---

## 📝 Final Report Template

After fixing, fill this out:

```
✅ New project path: [FILL IN]
✅ Node + PNPM OK: [YES/NO]
✅ Build OK: [YES/NO]
✅ Dist files OK: [YES/NO]
✅ Git OK: [YES/NO]
✅ Stripe script OK: [YES/NO]
✅ Demo OK: [YES/NO]
✅ No broken imports: [YES/NO]
✅ No missing folders: [YES/NO]
✅ No absolute paths left: [YES/NO]
✅ Everything fully functional: [YES/NO]
```

---

**Run the fixes above, then proceed to validation!**

