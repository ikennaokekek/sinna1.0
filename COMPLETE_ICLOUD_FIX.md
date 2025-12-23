# Complete iCloud Migration Fix - Step by Step

## 🎯 Quick Start

**Run this single command to detect and fix everything:**

```bash
bash detect-and-fix-icloud.sh
```

This script will:
1. Find your project in iCloud
2. Fix all dependencies
3. Rebuild everything
4. Fix Git
5. Validate paths

---

## 📍 Manual Detection (If Script Fails)

If the auto-detection doesn't work, find your project manually:

```bash
# Search for SINNA1.0
find ~ -name "SINNA1.0" -type d 2>/dev/null | grep -i cloud

# Common locations to check:
ls -la ~/Library/Mobile\ Documents/com~apple~CloudDocs/SINNA1.0
ls -la ~/iCloud\ Drive/SINNA1.0
ls -la ~/icloud/SINNA1.0
```

Once found, navigate there:
```bash
cd "/path/to/SINNA1.0/in/iCloud"
```

---

## 🔧 Manual Fix Steps

### Step 1: Clean Everything

```bash
cd "/path/to/SINNA1.0/in/iCloud"

# Remove all node_modules (symlinks break after move)
rm -rf node_modules
rm -rf apps/api/node_modules
rm -rf apps/worker/node_modules
rm -rf packages/types/node_modules
rm -rf packages/sdk-js/node_modules
rm -rf widget/node_modules

# Remove lockfile
rm -f pnpm-lock.yaml
```

### Step 2: Reinstall Dependencies

```bash
# Reinstall with pnpm
pnpm install --force

# If that fails, try:
pnpm install --force --shamefully-hoist
```

### Step 3: Rebuild

```bash
# Rebuild packages
pnpm rebuild

# Build project
pnpm run build
```

### Step 4: Fix Widget

```bash
cd widget

# Clean widget
rm -rf node_modules dist

# Reinstall
npm install

# Build
npm run build

# Verify
ls -la dist/widget.js dist/dev-widget.js

cd ..
```

### Step 5: Fix Git

```bash
# Re-index files
git add .

# Check status
git status

# Check remote
git remote -v

# If remote missing, add it:
# git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
```

### Step 6: Check for Absolute Paths

```bash
# Find absolute paths in config files
grep -r "/Users/" . --include="*.json" --include="*.js" --include="*.ts" | grep -v node_modules | grep -v ".git"
```

If found, edit those files and replace absolute paths with relative paths.

---

## ✅ Validation Tests

### Test 1: Node/Pnpm

```bash
node --version
pnpm --version
```

### Test 2: Build Outputs

```bash
# Check API build
test -d apps/api/dist && echo "✓ API dist exists" || echo "✗ Missing"

# Check worker build
test -d apps/worker/dist && echo "✓ Worker dist exists" || echo "✗ Missing"

# Check widget builds
test -f widget/dist/widget.js && echo "✓ widget.js exists" || echo "✗ Missing"
test -f widget/dist/dev-widget.js && echo "✓ dev-widget.js exists" || echo "✗ Missing"
```

### Test 3: Git

```bash
git status
git remote -v
```

### Test 4: Stripe Script

```bash
pnpm tsx scripts/create-test-checkout-now.ts --help
```

### Test 5: Widget Demo

```bash
cd widget
npm run preview
# Should start server - open http://localhost:8080
```

---

## 🚨 Common Fixes

### Fix: "pnpm store path error"

```bash
# Reset pnpm store
pnpm store prune
pnpm install --force
```

### Fix: "Module resolution errors"

```bash
# Clean everything
rm -rf node_modules apps/*/node_modules packages/*/node_modules widget/node_modules
rm -f pnpm-lock.yaml

# Reinstall
pnpm install --force --shamefully-hoist
```

### Fix: "TypeScript path errors"

Check these files for absolute paths:
- `tsconfig.json`
- `tsconfig.base.json`
- `apps/api/tsconfig.json`
- `apps/worker/tsconfig.json`
- `packages/types/tsconfig.json`

Replace any `/Users/...` paths with relative paths.

### Fix: "Widget build errors"

```bash
cd widget
rm -rf node_modules dist
npm install
npm run build
```

### Fix: "Git remote not found"

```bash
# Add remote (replace with your URL)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# Or update existing
git remote set-url origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# Verify
git remote -v
```

---

## 📋 Final Report Checklist

After running all fixes, verify:

- [ ] **New project path detected**: `[FILL IN PATH]`
- [ ] **Node + PNPM OK**: `node --version` and `pnpm --version` work
- [ ] **Build OK**: `pnpm run build` completes successfully
- [ ] **Dist files OK**: All dist directories exist
- [ ] **Widget builds OK**: `widget/dist/widget.js` and `widget/dist/dev-widget.js` exist
- [ ] **Git OK**: `git status` and `git remote -v` work
- [ ] **Stripe script OK**: `pnpm tsx scripts/create-test-checkout-now.ts` runs
- [ ] **Demo OK**: `cd widget && npm run preview` starts server
- [ ] **No broken imports**: No module resolution errors
- [ ] **No missing folders**: All expected directories exist
- [ ] **No absolute paths**: No `/Users/...` paths in config files
- [ ] **Everything functional**: All systems working from iCloud

---

## 🎯 One-Command Fix

Save this as `fix-all.sh`:

```bash
#!/bin/bash
set -e
cd "$(dirname "$0")"
rm -rf node_modules apps/*/node_modules packages/*/node_modules widget/node_modules pnpm-lock.yaml
pnpm install --force
pnpm rebuild
pnpm run build
cd widget && npm install && npm run build && cd ..
git add . && git status
echo "✅ Fix complete!"
```

Run: `bash fix-all.sh`

---

**After running fixes, proceed to validation!**

