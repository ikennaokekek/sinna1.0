# Fix 3: Verify Dev Widget Controls

## File: widget/src/SinnaPresetDev.js

This file should already have the developer UI controls. Verify it contains:

1. **renderDeveloperUI() method** that returns:
   - Dev banner with "DEV MODE" badge
   - Theme toggle dropdown (`id="dev-theme-toggle"`)
   - Accent color picker (`id="dev-accent-color"`)

2. **Event listeners** in render() method:
   - Theme toggle change handler
   - Accent color input handler

3. **Styles** for dev controls:
   - `.dev-banner`
   - `.dev-controls`
   - `.dev-theme-toggle`
   - `.dev-accent-color`

If any of these are missing, the dev widget won't show controls.

## Expected Structure:

```javascript
class SinnaPresetDev extends SinnaPresetBase {
  renderDeveloperUI() {
    return `
      <div class="dev-banner">...</div>
      <div class="dev-controls">
        <select id="dev-theme-toggle">...</select>
        <input type="color" id="dev-accent-color">...</input>
      </div>
    `;
  }
  
  render() {
    super.render();
    // Attach event listeners for dev controls
  }
}
```

