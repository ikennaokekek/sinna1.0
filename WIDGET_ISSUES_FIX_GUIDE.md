# Widget Issues Fix Guide

## Issues to Fix

### Issue 1: Production Mode Script Loading Failure
**Error:** "Failed to switch to production mode: Failed to load production widget script"

**Cause:** The demo is trying to load from `https://cdn.sinna.site/widget.js` which doesn't exist or isn't accessible.

**Fix:** Change production mode to use local `/dist/widget.js` instead of CDN.

---

### Issue 2: Developer Mode Missing Controls
**Problem:** No theme switch, accent dial, or presets showing in developer mode.

**Causes:**
1. `SinnaPresetDev.js` may be missing `renderDeveloperUI()` method
2. Event listeners not attached for theme/accent controls
3. Presets not rendering properly

**Fix:** Ensure developer widget has all required UI components and event handlers.

---

## Quick Fix (Automated)

**Run from your SINNA1.0 directory:**

```bash
bash fix-all-widget-issues.sh
```

Or manually:

```bash
# Fix production mode
node fix-demo-production-mode.js

# Fix developer controls
node fix-dev-widget-controls.js

# Rebuild
cd widget
npm run build
```

---

## Manual Fixes

### Fix 1: Production Mode Script Loading

**File:** `widget/demo/index.html`

**Find:**
```javascript
script.src = 'https://cdn.sinna.site/widget.js';
```

**Replace with:**
```javascript
script.src = '/dist/widget.js';
```

**Also add error handling:**
```javascript
script.onerror = () => {
  reject(new Error('Failed to load widget script: ' + script.src));
};
```

---

### Fix 2: Developer Widget Controls

**File:** `widget/src/SinnaPresetDev.js`

**Ensure it has `renderDeveloperUI()` method:**
```javascript
renderDeveloperUI() {
  return `
    <div class="dev-banner">
      <div class="dev-banner-content">
        <span class="dev-badge">DEV MODE</span>
        <span class="dev-text">Developer Widget - Theme controls enabled</span>
      </div>
    </div>
    <div class="dev-controls">
      <div class="dev-control-group">
        <label for="dev-theme-toggle">Theme</label>
        <select id="dev-theme-toggle" class="dev-select">
          <option value="light" ${this.theme === 'light' ? 'selected' : ''}>Light</option>
          <option value="dark" ${this.theme === 'dark' ? 'selected' : ''}>Dark</option>
        </select>
      </div>
      <div class="dev-control-group">
        <label for="dev-accent-color">Accent Color</label>
        <input type="color" id="dev-accent-color" class="dev-color-input" value="${this.accent || '#0066cc'}">
      </div>
    </div>
  `;
}
```

**Ensure `render()` method attaches event listeners:**
```javascript
render() {
  super.render();
  
  // Attach developer UI event listeners
  setTimeout(() => {
    const themeToggle = this.shadowRoot?.getElementById('dev-theme-toggle');
    const accentColor = this.shadowRoot?.getElementById('dev-accent-color');

    if (themeToggle) {
      themeToggle.addEventListener('change', (e) => {
        this.setAttribute('theme', e.target.value);
      });
    }

    if (accentColor) {
      accentColor.addEventListener('input', (e) => {
        this.setAttribute('accent', e.target.value);
      });
    }
  }, 0);
}
```

---

### Fix 3: Presets Not Showing

**File:** `widget/src/SinnaPresetBase.js`

**Ensure `renderPresets()` method exists and is called in `render()`:**
```javascript
renderPresets() {
  const presets = [
    { id: 'everyday', label: 'Everyday', desc: 'Balanced defaults' },
    { id: 'autism', label: 'Autism', desc: 'Reduced motion, calm colors' },
    // ... all other presets
  ];
  
  return presets.map(preset => `
    <div class="preset-card" data-preset="${preset.id}">
      <h4>${preset.label}</h4>
      <p>${preset.desc}</p>
    </div>
  `).join('');
}
```

**Ensure it's called in `render()`:**
```javascript
render() {
  return `
    ${this.getStyles()}
    <div class="sinna-widget">
      ${this.renderDeveloperUI()}
      <div class="widget-header">...</div>
      <div class="presets-container">
        ${this.renderPresets()}
      </div>
      ...
    </div>
  `;
}
```

---

## After Fixes

```bash
cd widget
npm run build
npm run preview
```

**Test:**
1. ✅ Production mode loads without errors
2. ✅ Developer mode shows theme toggle
3. ✅ Developer mode shows accent color picker
4. ✅ Presets are visible and selectable

---

**Run the automated fix script for easiest solution!**

