# iCloud Migration - Complete Fix Instructions

## 🚀 Quick Start

**Run this single command from your SINNA1.0 directory in iCloud:**

```bash
bash RUN_ICLOUD_FIX.sh
```

This will automatically:
1. ✅ Clean all broken symlinks
2. ✅ Reinstall all dependencies
3. ✅ Rebuild all packages
4. ✅ Build widget
5. ✅ Fix Git
6. ✅ Check for path issues

---

## 📍 Step 1: Find Your Project

If you don't know where your project is in iCloud, run:

```bash
# Auto-detect script
bash detect-and-fix-icloud.sh

# Or search manually
find ~ -name "SINNA1.0" -type d 2>/dev/null | grep -i cloud
```

Common iCloud locations:
- `~/Library/Mobile Documents/com~apple~CloudDocs/SINNA1.0`
- `~/iCloud Drive/SINNA1.0`
- `~/icloud/SINNA1.0`

Once found, navigate there:
```bash
cd "/path/to/SINNA1.0/in/iCloud"
```

---

## 🔧 Step 2: Run the Fix Script

```bash
# Make sure you're in the project directory
cd "/path/to/SINNA1.0/in/iCloud"

# Run the fix script
bash RUN_ICLOUD_FIX.sh
```

The script will:
- Clean all `node_modules` (symlinks break after move)
- Remove `pnpm-lock.yaml` (will be regenerated)
- Reinstall all dependencies
- Rebuild all packages
- Build widget
- Fix Git indexing
- Check for absolute paths

---

## ✅ Step 3: Validate Everything

### 3.1 Check Build Outputs

```bash
# Verify API build
test -d apps/api/dist && echo "✓ API dist exists" || echo "✗ Missing"

# Verify worker build
test -d apps/worker/dist && echo "✓ Worker dist exists" || echo "✗ Missing"

# Verify widget builds
test -f widget/dist/widget.js && echo "✓ widget.js exists" || echo "✗ Missing"
test -f widget/dist/dev-widget.js && echo "✓ dev-widget.js exists" || echo "✗ Missing"
```

### 3.2 Test Stripe Script

```bash
# Test Stripe checkout script
pnpm tsx scripts/create-test-checkout-now.ts --help

# If .env is missing:
cp env.example .env
# Then edit .env with your values
```

### 3.3 Test Widget Demo

```bash
cd widget
npm run preview

# Should start server on http://localhost:8080
# Open in browser and verify widget loads
```

### 3.4 Verify Git

```bash
# Check status
git status

# Check remote
git remote -v

# Test push (dry-run)
git push --dry-run origin main
```

---

## 🚨 Manual Fixes (If Script Fails)

### Fix PNPM Store Issues

```bash
# Reset pnpm store
pnpm store prune

# Reinstall with hoisting
pnpm install --force --shamefully-hoist
```

### Fix TypeScript Paths

Check these files for absolute paths:
- `tsconfig.json`
- `tsconfig.base.json`
- `apps/api/tsconfig.json`
- `apps/worker/tsconfig.json`
- `packages/types/tsconfig.json`

Replace `/Users/...` with relative paths.

### Fix Widget Build

```bash
cd widget
rm -rf node_modules dist
npm install
npm run build
cd ..
```

### Fix Git Remote

```bash
# Add remote (if missing)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# Or update existing
git remote set-url origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# Verify
git remote -v
```

---

## 📋 Final Report Template

After running fixes, fill this out:

```
═══════════════════════════════════════════════════════════
  iCloud Migration - Final Report
═══════════════════════════════════════════════════════════

✅ New project path: [FILL IN FULL PATH]

✅ Node + PNPM OK: [YES/NO]
   Node version: [VERSION]
   PNPM version: [VERSION]

✅ Build OK: [YES/NO]
   API build: [YES/NO]
   Worker build: [YES/NO]
   Widget build: [YES/NO]

✅ Dist files OK: [YES/NO]
   apps/api/dist: [EXISTS/MISSING]
   apps/worker/dist: [EXISTS/MISSING]
   widget/dist/widget.js: [EXISTS/MISSING]
   widget/dist/dev-widget.js: [EXISTS/MISSING]

✅ Git OK: [YES/NO]
   Git status: [CLEAN/MODIFIED]
   Remote origin: [CONFIGURED/MISSING]
   Remote URL: [URL]

✅ Stripe script OK: [YES/NO]
   Script runs: [YES/NO]
   .env file: [EXISTS/MISSING]

✅ Demo OK: [YES/NO]
   Preview server starts: [YES/NO]
   Widget loads: [YES/NO]

✅ No broken imports: [YES/NO]
✅ No missing folders: [YES/NO]
✅ No absolute paths left: [YES/NO]
✅ Everything fully functional: [YES/NO]

═══════════════════════════════════════════════════════════
```

---

## 🎯 One-Line Commands

**Complete fix:**
```bash
cd "/path/to/SINNA1.0/in/iCloud" && bash RUN_ICLOUD_FIX.sh
```

**Quick validation:**
```bash
cd "/path/to/SINNA1.0/in/iCloud" && pnpm run build && cd widget && npm run build && cd .. && git status
```

**Test everything:**
```bash
cd "/path/to/SINNA1.0/in/iCloud" && pnpm run build && pnpm tsx scripts/create-test-checkout-now.ts --help && cd widget && npm run preview
```

---

## 📝 Notes

- **Symlinks break** when moving to iCloud - that's why we remove all `node_modules`
- **pnpm-lock.yaml** needs regeneration after move
- **Git remotes** may need to be re-added
- **Absolute paths** in config files need to be relative
- **Widget builds** need to be regenerated

All of this is handled by the fix script!

---

**Run `bash RUN_ICLOUD_FIX.sh` to fix everything automatically!**

