# Apply Fixes and Rebuild - Instructions

## Quick Run

**From your iCloud SINNA1.0 directory, run:**

```bash
bash apply-and-rebuild.sh
```

Or manually:

```bash
# Apply fixes
node fix-widgets.js

# Rebuild widget
cd widget
npm run build

# Preview (optional)
npm run preview
```

## What This Does

1. ✅ Applies all three widget fixes:
   - Updates header text to "SINNA 1.0" and "Accessibility, Automated"
   - Fixes demo script paths (`../dist/` → `/dist/`)
   - Verifies/adds developer UI controls

2. ✅ Rebuilds the widget:
   - Creates `dist/widget.js` (production)
   - Creates `dist/dev-widget.js` (developer)

3. ✅ Ready to preview:
   - Run `npm run preview` to test at http://localhost:8080

## Verification

After rebuilding, check:
- [ ] Header shows "SINNA 1.0"
- [ ] Subtitle shows "Accessibility, Automated"
- [ ] Toggle switches work correctly
- [ ] Developer mode shows theme controls

---

**Run the script from your iCloud project directory!**

