# Apply Widget Fixes - Ready to Use

## 🚀 Quick Fix Script

**Run this from your SINNA1.0 directory:**

```bash
node fix-widgets.js
```

Or:

```bash
python3 apply_widget_fixes.py
```

---

## 📝 Manual Fixes (If Script Doesn't Work)

### Fix 1: Header Text

**File:** `widget/src/SinnaPresetBase.js`

**Find this (around line 640-650):**
```javascript
        <div class="widget-header">
          <h3>Sinna Accessibility Presets</h3>
          <p class="subtitle">Select a preset to analyze your video</p>
        </div>
```

**Replace with:**
```javascript
        <div class="widget-header">
          <h3>SINNA 1.0</h3>
          <p class="subtitle">Accessibility, Automated</p>
        </div>
```

---

### Fix 2: Demo Paths

**File:** `widget/demo/index.html`

**Find this (around line 240-250):**
```javascript
        if (mode === 'developer') {
          script.src = '../dist/dev-widget.js';
        } else {
          script.src = 'https://cdn.sinna.site/widget.js';
        }
```

**Replace with:**
```javascript
        if (mode === 'developer') {
          script.src = '/dist/dev-widget.js';
        } else {
          script.src = 'https://cdn.sinna.site/widget.js';
        }
```

**Also search for ALL occurrences of:**
- `'../dist/dev-widget.js'` → `'/dist/dev-widget.js'`
- `"../dist/dev-widget.js"` → `"/dist/dev-widget.js"`

---

### Fix 3: Verify Dev Widget

**File:** `widget/src/SinnaPresetDev.js`

**Verify it contains:**
- `renderDeveloperUI()` method
- `dev-theme-toggle` element
- `dev-accent-color` element

If missing, the dev widget won't show controls.

---

## ✅ After Applying Fixes

```bash
cd widget
npm run build
npm run preview
```

**Test:**
1. Header shows "SINNA 1.0"
2. Subtitle shows "Accessibility, Automated"
3. Toggle switches work
4. Dev mode shows theme controls

---

**All fixes are ready to apply!**

