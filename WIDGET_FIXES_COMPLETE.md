# Widget Fixes - Complete Instructions

## 🎯 Three Fixes Required

### Fix 1: Update Header Text ✅
**File:** `widget/src/SinnaPresetBase.js`

**Change:**
- "Sinna Accessibility Presets" → "SINNA 1.0"
- "Select a preset to analyze your video" → "Accessibility, Automated"

### Fix 2: Fix Toggle Loader Paths ✅
**File:** `widget/demo/index.html`

**Change:**
- `'../dist/dev-widget.js'` → `'/dist/dev-widget.js'`
- `"../dist/dev-widget.js"` → `"/dist/dev-widget.js"`

### Fix 3: Verify Dev Widget Controls ✅
**File:** `widget/src/SinnaPresetDev.js`

**Verify:**
- Theme toggle exists
- Accent color picker exists
- Demo banner exists

---

## 🚀 Quick Apply (Automated)

**Run this script from widget/ directory:**

```bash
cd widget
bash ../APPLY_WIDGET_FIXES.sh
```

Or manually apply the fixes below.

---

## 📝 Manual Fix Instructions

### Fix 1: Header Text

**Open:** `widget/src/SinnaPresetBase.js`

**Find (around line 640-645):**
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

### Fix 2: Demo Paths

**Open:** `widget/demo/index.html`

**Find (around line 240-250):**
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

**Also find initial load (around line 340):**
```javascript
loadWidgetScript('developer')
```

**Ensure it uses:**
```javascript
script.src = '/dist/dev-widget.js';
```

### Fix 3: Verify Dev Widget

**Open:** `widget/src/SinnaPresetDev.js`

**Verify it has:**
```javascript
renderDeveloperUI() {
  return `
    <div class="dev-banner">...</div>
    <div class="dev-controls">
      <select id="dev-theme-toggle">...</select>
      <input type="color" id="dev-accent-color">...</input>
    </div>
  `;
}
```

If missing, the file needs to be checked/fixed.

---

## ✅ After Applying Fixes

```bash
cd widget
npm run build
npm run preview
```

**Test:**
1. ✅ Header shows "SINNA 1.0" and "Accessibility, Automated"
2. ✅ Toggle switches work (Developer ↔ Production)
3. ✅ Developer mode shows theme controls and accent picker
4. ✅ Demo loads at http://localhost:8080

---

## 🔍 Verification Checklist

- [ ] Header text updated to "SINNA 1.0"
- [ ] Subtitle updated to "Accessibility, Automated"
- [ ] Demo paths fixed (`/dist/` instead of `../dist/`)
- [ ] Toggle loads correct scripts
- [ ] Dev widget shows theme controls
- [ ] Dev widget shows accent picker
- [ ] Dev widget shows demo banner
- [ ] Build completes successfully
- [ ] Preview server starts
- [ ] Widget renders correctly

---

**Apply fixes, then rebuild and test!**

