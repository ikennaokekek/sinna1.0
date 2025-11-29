/**
 * Sinna Preset Widget - Developer Version
 * Includes developer UI: theme toggle, accent color picker, demo banner
 */

import SinnaPresetBase from './SinnaPresetBase.js';

class SinnaPresetDev extends SinnaPresetBase {
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

  getStyles() {
    const baseStyles = super.getStyles();
    return baseStyles + `
      <style>
        .dev-banner {
          margin-bottom: 24px;
          padding: 12px 20px;
          background: linear-gradient(135deg, #fef3c7, #fde68a);
          border: 2px solid #f59e0b;
          border-radius: 8px;
        }

        .dev-banner-content {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13px;
        }

        .dev-badge {
          padding: 4px 10px;
          background: #f59e0b;
          color: white;
          border-radius: 4px;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .dev-text {
          color: #92400e;
          font-weight: 500;
        }

        .dev-controls {
          display: flex;
          gap: 16px;
          margin-bottom: 24px;
          padding: 16px;
          background: var(--sinna-surface);
          border: 1px solid var(--sinna-border);
          border-radius: 12px;
          flex-wrap: wrap;
        }

        .dev-control-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
          min-width: 150px;
        }

        .dev-control-group label {
          font-size: 12px;
          font-weight: 600;
          color: var(--sinna-text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .dev-select {
          padding: 8px 12px;
          border: 1px solid var(--sinna-border);
          border-radius: 8px;
          background: var(--sinna-card-bg);
          color: var(--sinna-text-primary);
          font-family: inherit;
          font-size: 14px;
          cursor: pointer;
          transition: border-color 0.2s ease;
        }

        .dev-select:hover {
          border-color: var(--sinna-accent);
        }

        .dev-select:focus {
          outline: none;
          border-color: var(--sinna-accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--sinna-accent) 20%, transparent);
        }

        .dev-color-input {
          width: 100%;
          height: 40px;
          border: 1px solid var(--sinna-border);
          border-radius: 8px;
          cursor: pointer;
          transition: border-color 0.2s ease;
        }

        .dev-color-input:hover {
          border-color: var(--sinna-accent);
        }

        .dev-color-input:focus {
          outline: none;
          border-color: var(--sinna-accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--sinna-accent) 20%, transparent);
        }

        @media (max-width: 768px) {
          .dev-controls {
            flex-direction: column;
          }

          .dev-control-group {
            min-width: 100%;
          }
        }
      </style>
    `;
  }

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
}

export default SinnaPresetDev;

