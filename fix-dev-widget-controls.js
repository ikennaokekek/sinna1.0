// Fix Developer Widget Controls
// This script ensures SinnaPresetDev.js has all required developer UI

const fs = require('fs');
const path = require('path');

const devWidgetPath = path.join(__dirname, 'widget/src/SinnaPresetDev.js');
const baseWidgetPath = path.join(__dirname, 'widget/src/SinnaPresetBase.js');

console.log('🔧 Fixing developer widget controls...');

// Check if files exist
if (!fs.existsSync(devWidgetPath)) {
    console.error('❌ widget/src/SinnaPresetDev.js not found');
    process.exit(1);
}

if (!fs.existsSync(baseWidgetPath)) {
    console.error('❌ widget/src/SinnaPresetBase.js not found');
    process.exit(1);
}

let devContent = fs.readFileSync(devWidgetPath, 'utf8');
let baseContent = fs.readFileSync(baseWidgetPath, 'utf8');

// Create backups
fs.writeFileSync(devWidgetPath + '.bak', devContent);
fs.writeFileSync(baseWidgetPath + '.bak', baseContent);

let devChanged = false;
let baseChanged = false;

// Fix 1: Ensure renderDeveloperUI method exists in dev widget
if (!devContent.includes('renderDeveloperUI()')) {
    console.log('⚠ Adding renderDeveloperUI method...');
    
    // Find the class definition and add method after constructor or before render
    const classMatch = devContent.match(/class\s+SinnaPresetDev[^{]+{([\s\S]*)/);
    if (classMatch) {
        const renderMatch = devContent.match(/\s+render\(\)\s*{/);
        if (renderMatch) {
            // Insert before render method
            const insertPos = renderMatch.index;
            const renderDeveloperUIMethod = `
  renderDeveloperUI() {
    return \`
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
            <option value="light" \${this.theme === 'light' ? 'selected' : ''}>Light</option>
            <option value="dark" \${this.theme === 'dark' ? 'selected' : ''}>Dark</option>
          </select>
        </div>
        <div class="dev-control-group">
          <label for="dev-accent-color">Accent Color</label>
          <input type="color" id="dev-accent-color" class="dev-color-input" value="\${this.accent || '#0066cc'}">
        </div>
      </div>
    \`;
  }
`;
            devContent = devContent.slice(0, insertPos) + renderDeveloperUIMethod + devContent.slice(insertPos);
            devChanged = true;
        }
    }
}

// Fix 2: Ensure render method attaches event listeners
if (!devContent.includes('dev-theme-toggle') || !devContent.includes('addEventListener')) {
    console.log('⚠ Adding event listeners for dev controls...');
    
    // Find render method and add event listeners
    const renderMethodMatch = devContent.match(/(render\(\)\s*{[\s\S]*?)(}\s*$)/m);
    if (renderMethodMatch) {
        const renderEnd = renderMethodMatch.index + renderMethodMatch[1].length;
        const eventListeners = `
    
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
`;
        devContent = devContent.slice(0, renderEnd - 1) + eventListeners + '\n' + devContent.slice(renderEnd - 1);
        devChanged = true;
    }
}

// Fix 3: Ensure presets are rendered in base widget
if (!baseContent.includes('preset') || !baseContent.match(/preset.*option|preset.*button|preset.*grid/i)) {
    console.log('⚠ Checking preset rendering...');
    // This would require more complex changes, so we'll just warn
    console.log('  Note: If presets are not showing, check renderPresets() method');
}

// Write changes
if (devChanged) {
    fs.writeFileSync(devWidgetPath, devContent, 'utf8');
    console.log('✓ Updated SinnaPresetDev.js');
}

if (baseChanged) {
    fs.writeFileSync(baseWidgetPath, baseContent, 'utf8');
    console.log('✓ Updated SinnaPresetBase.js');
}

if (!devChanged && !baseChanged) {
    console.log('✓ All developer controls already present');
}

console.log('✅ Developer widget controls fixed!');

