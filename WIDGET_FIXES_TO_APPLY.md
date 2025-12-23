# Widget Fixes - Apply These Changes

## Fix 1: Update Header Text

**File:** `widget/src/SinnaPresetBase.js`

**Find this code (around line 640-650 in render method):**
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

## Fix 2: Fix Toggle Loader Paths

**File:** `widget/demo/index.html`

**Find the script loading code (around line 240-260):**
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

**Also find the initial load (around line 340):**
```javascript
loadWidgetScript('developer').catch(error => {
```

**And ensure it uses:**
```javascript
script.src = '/dist/dev-widget.js';
```

---

## Fix 3: Verify Dev Widget Controls

**File:** `widget/src/SinnaPresetDev.js`

**Verify it has the renderDeveloperUI method that returns:**
- Theme toggle dropdown
- Accent color picker
- Demo banner

**If missing, ensure it extends SinnaPresetBase and adds developer UI.**

---

## After Making Changes

```bash
cd widget
npm run build
npm run preview
```

Test:
1. Header shows "SINNA 1.0" and "Accessibility, Automated"
2. Toggle switches between dev and production modes
3. Developer mode shows theme controls and accent picker

