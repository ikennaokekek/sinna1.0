# Exact Widget Fixes - Copy & Paste Ready

## 🎯 Fix 1: Header Text

**File:** `widget/src/SinnaPresetBase.js`

**Location:** In the `render()` method, find the widget-header section

**FIND:**
```javascript
        <div class="widget-header">
          <h3>Sinna Accessibility Presets</h3>
          <p class="subtitle">Select a preset to analyze your video</p>
        </div>
```

**REPLACE WITH:**
```javascript
        <div class="widget-header">
          <h3>SINNA 1.0</h3>
          <p class="subtitle">Accessibility, Automated</p>
        </div>
```

---

## 🎯 Fix 2: Demo Toggle Paths

**File:** `widget/demo/index.html`

**Location 1:** In the `loadWidgetScript()` function

**FIND:**
```javascript
        if (mode === 'developer') {
          script.src = '../dist/dev-widget.js';
        } else {
          script.src = 'https://cdn.sinna.site/widget.js';
        }
```

**REPLACE WITH:**
```javascript
        if (mode === 'developer') {
          script.src = '/dist/dev-widget.js';
        } else {
          script.src = 'https://cdn.sinna.site/widget.js';
        }
```

**Location 2:** Also check for any other occurrences of `../dist/`

**FIND ALL:**
```javascript
'../dist/dev-widget.js'
"../dist/dev-widget.js"
```

**REPLACE ALL WITH:**
```javascript
'/dist/dev-widget.js'
"/dist/dev-widget.js"
```

---

## 🎯 Fix 3: Verify Dev Widget Controls

**File:** `widget/src/SinnaPresetDev.js`

**Verify this method exists:**
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

**Verify render() method attaches event listeners:**
```javascript
  render() {
    super.render();
    
    // Attach developer UI event listeners
    setTimeout(() => {
      const themeToggle = this.shadowRoot.getElementById('dev-theme-toggle');
      const accentColor = this.shadowRoot.getElementById('dev-accent-color');

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

## 🚀 After Applying Fixes

```bash
cd widget
npm run build
npm run preview
```

**Test Checklist:**
- [ ] Header shows "SINNA 1.0"
- [ ] Subtitle shows "Accessibility, Automated"
- [ ] Toggle switches between dev/prod modes
- [ ] Developer mode loads `/dist/dev-widget.js`
- [ ] Production mode loads CDN URL
- [ ] Dev mode shows theme toggle
- [ ] Dev mode shows accent color picker
- [ ] Dev mode shows "DEV MODE" banner
- [ ] Theme changes work in dev mode
- [ ] Accent color changes work in dev mode

---

## 🔧 Quick Apply Script

Save this as `apply-fixes.sh` in widget/ directory:

```bash
#!/bin/bash
cd "$(dirname "$0")"

echo "Applying fixes..."

# Fix 1: Header text
sed -i.bak 's/Sinna Accessibility Presets/SINNA 1.0/g' src/SinnaPresetBase.js
sed -i.bak 's/Select a preset to analyze your video/Accessibility, Automated/g' src/SinnaPresetBase.js

# Fix 2: Demo paths
sed -i.bak "s|'../dist/dev-widget.js'|'/dist/dev-widget.js'|g" demo/index.html
sed -i.bak 's|"../dist/dev-widget.js"|"/dist/dev-widget.js"|g' demo/index.html

echo "✓ Fixes applied"
echo "Building..."
npm run build
echo "✅ Done! Run 'npm run preview' to test"
```

Run: `bash apply-fixes.sh`

---

**Apply these exact changes, then rebuild and test!**

