/**
 * Sinna Preset Widget - Base Class
 * Core functionality without developer UI
 * Used by both live and developer versions
 */

class SinnaPresetBase extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.selectedPreset = null;
    this.processing = false;
    this.apiKey = null;
    this.videoUrl = null;
    this.theme = 'light';
    this.accent = null;
    this.resultData = null;
    this.instant = false;
    this.instantDataLoaded = false;
    this.realJobId = null;
  }

  static get observedAttributes() {
    return ['api-key', 'video-url', 'theme', 'accent', 'instant'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      if (name === 'api-key') {
        this.apiKey = newValue;
        this.render();
      } else if (name === 'video-url') {
        this.videoUrl = newValue;
        this.render();
      } else if (name === 'theme') {
        this.theme = newValue || 'light';
        this.updateTheme();
        if (this.shadowRoot && this.shadowRoot.innerHTML) {
          this.render();
        }
      } else if (name === 'accent') {
        this.accent = newValue;
        this.updateTheme();
        if (this.shadowRoot && this.shadowRoot.innerHTML) {
          this.render();
        }
      } else if (name === 'instant') {
        this.instant = newValue === 'true';
        if (this.instant && this.shadowRoot && this.shadowRoot.innerHTML) {
          this.loadInstantDemo();
        }
      }
    }
  }

  connectedCallback() {
    this.apiKey = this.getAttribute('api-key');
    this.videoUrl = this.getAttribute('video-url');
    this.theme = this.getAttribute('theme') || 'light';
    this.accent = this.getAttribute('accent');
    this.instant = this.getAttribute('instant') === 'true';
    this.updateTheme();
    this.render();
    
    // Load instant demo if enabled
    if (this.instant) {
      this.loadInstantDemo();
    }
  }

  updateTheme() {
    if (this.theme) {
      this.setAttribute('data-theme', this.theme);
    } else {
      this.removeAttribute('data-theme');
    }

    const root = this.shadowRoot;
    if (!root) return;

    const oldThemeStyle = root.querySelector('style[data-theme-vars]');
    if (oldThemeStyle) oldThemeStyle.remove();

    const style = document.createElement('style');
    style.setAttribute('data-theme-vars', 'true');
    
    const themeVars = this.getThemeVariables();
    
    style.textContent = `
      :host {
        ${Object.entries(themeVars).map(([key, value]) => `--sinna-${key}: ${value};`).join('\n        ')}
      }
    `;
    
    root.appendChild(style);

    const resultArea = root.querySelector('.result-area');
    if (resultArea) {
      const viewer = resultArea.querySelector('sinna-results-viewer');
      if (viewer) {
        if (this.theme) viewer.setAttribute('data-theme', this.theme);
        if (this.accent) viewer.setAttribute('data-accent', this.accent);
      }
    }
  }

  getThemeVariables() {
    const isDark = this.theme === 'dark';
    const accent = this.accent || (isDark ? '#3b82f6' : '#0066cc');
    
    return {
      bg: isDark ? '#0f172a' : '#ffffff',
      fg: isDark ? '#f1f5f9' : '#1a1a1a',
      'card-bg': isDark ? '#1e293b' : '#ffffff',
      'card-border': isDark ? '#334155' : '#e5e7eb',
      accent: accent,
      'accent-hover': this.adjustBrightness(accent, isDark ? -15 : -10),
      'accent-light': this.adjustBrightness(accent, isDark ? 20 : 90),
      shadow: isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)',
      'shadow-hover': isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.15)',
      'shadow-lg': isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.2)',
      'text-primary': isDark ? '#f1f5f9' : '#1a1a1a',
      'text-secondary': isDark ? '#cbd5e1' : '#666666',
      'text-muted': isDark ? '#94a3b8' : '#999999',
      border: isDark ? '#334155' : '#e5e7eb',
      surface: isDark ? '#1e293b' : '#f8f9fa',
      'surface-hover': isDark ? '#334155' : '#e9ecef',
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
      info: '#3b82f6',
      'gradient-start': isDark ? '#4c1d95' : '#667eea',
      'gradient-end': isDark ? '#7c3aed' : '#764ba2',
    };
  }

  adjustBrightness(hex, percent) {
    if (!hex || !hex.startsWith('#')) return hex;
    const num = parseInt(hex.replace('#', ''), 16);
    if (isNaN(num)) return hex;
    
    const r = Math.min(255, Math.max(0, (num >> 16) + percent));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + percent));
    const b = Math.min(255, Math.max(0, (num & 0x0000FF) + percent));
    
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  getPresets() {
    return [
      { id: 'everyday', label: 'Everyday', description: 'Balanced defaults', icon: '⚖️' },
      { id: 'autism', label: 'Autism', description: 'Reduced motion, calm colors', icon: '🧩' },
      { id: 'adhd', label: 'ADHD', description: 'Motion reduction, faster playback', icon: '⚡' },
      { id: 'cognitive', label: 'Cognitive', description: 'Simplified language', icon: '🧠' },
      { id: 'deaf', label: 'Deaf', description: 'Burned captions, volume boost', icon: '👂' },
      { id: 'blindness', label: 'Blindness', description: 'Audio description mixing', icon: '👁️' },
      { id: 'color_blindness', label: 'Color Blindness', description: 'Color-safe palette', icon: '🎨' },
      { id: 'epilepsy_flash', label: 'Epilepsy (Flash)', description: 'Flash reduction', icon: '⚡' },
      { id: 'epilepsy_noise', label: 'Epilepsy (Noise)', description: 'Audio smoothing', icon: '🔊' },
      { id: 'low_vision', label: 'Low Vision', description: 'High contrast, large text', icon: '🔍' },
      { id: 'hoh', label: 'Hard of Hearing', description: 'Descriptive captions', icon: '📢' },
      { id: 'motion', label: 'Motion Sensitivity', description: 'Motion sensitivity', icon: '🌊' },
      { id: 'cognitive_load', label: 'Cognitive Load', description: 'Simplified transitions', icon: '📊' },
    ];
  }

  handlePresetSelect(presetId) {
    this.selectedPreset = presetId;
    this.render();
  }

  async loadInstantDemo() {
    if (this.instantDataLoaded) return;
    
    try {
      // Try multiple paths for sample JSON
      const samplePaths = [
        '../sample/instant-demo.json',
        './sample/instant-demo.json',
        'https://cdn.sinna.site/sample/instant-demo.json',
      ];
      
      let sampleData = null;
      for (const sampleUrl of samplePaths) {
        try {
          const response = await fetch(sampleUrl);
          if (response.ok) {
            sampleData = await response.json();
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!sampleData) {
        console.warn('Could not load instant demo JSON, continuing without it');
        return;
      }
      
      this.instantDataLoaded = true;
      
      // Show instant results immediately
      this.resultData = sampleData;
      this.showResults(sampleData);
      this.render();
      
      // Show instant mode banner
      this.showInstantBanner();
    } catch (error) {
      console.warn('Failed to load instant demo:', error);
    }
  }

  showInstantBanner() {
    const resultArea = this.shadowRoot.querySelector('.result-area');
    if (resultArea) {
      const banner = document.createElement('div');
      banner.className = 'instant-banner';
      banner.innerHTML = `
        <div class="instant-banner-content">
          <span class="instant-badge">INSTANT MODE</span>
          <span class="instant-text">Displaying sample results while analysis runs...</span>
        </div>
      `;
      resultArea.insertBefore(banner, resultArea.firstChild);
    }
  }

  async handleAnalyze() {
    if (!this.apiKey) {
      this.showError('API key is required. Set the api-key attribute.');
      return;
    }

    if (!this.videoUrl) {
      this.showError('Video URL is required. Set the video-url attribute.');
      return;
    }

    if (!this.selectedPreset) {
      this.showError('Please select a preset.');
      return;
    }

    this.processing = true;
    
    // In instant mode, keep showing sample data while processing
    if (!this.instant) {
      this.resultData = null;
    }
    
    this.render();

    try {
      const response = await fetch('https://sinna.site/v1/jobs', {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_url: this.videoUrl,
          preset_id: this.selectedPreset,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const jobId = data.data.id;
      this.realJobId = jobId;
      
      // In instant mode, poll in background and replace when ready
      if (this.instant) {
        this.pollJobStatusBackground(jobId);
      } else {
        this.pollJobStatus(jobId);
      }
    } catch (error) {
      this.processing = false;
      this.showError(`Failed to create job: ${error.message}`);
      this.render();
    }
  }

  async pollJobStatus(jobId, maxAttempts = 120) {
    let attempts = 0;

    const poll = async () => {
      attempts++;

      try {
        const response = await fetch(`https://sinna.site/v1/jobs/${jobId}`, {
          headers: {
            'X-API-Key': this.apiKey,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        const status = data.data.status;

        if (status === 'completed') {
          this.processing = false;
          this.resultData = data.data;
          this.showResults(data.data);
          this.render();
          return;
        }

        if (status === 'failed') {
          this.processing = false;
          this.showError('Job processing failed. Check the API response for details.');
          this.render();
          return;
        }

        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          this.processing = false;
          this.showError('Job processing timed out. The job may still be processing.');
          this.render();
        }
      } catch (error) {
        this.processing = false;
        this.showError(`Failed to check job status: ${error.message}`);
        this.render();
      }
    };

    poll();
  }

  showError(message) {
    const resultArea = this.shadowRoot.querySelector('.result-area');
    if (resultArea) {
      resultArea.innerHTML = `
        <div class="error-container">
          <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div class="error-message">${message}</div>
        </div>
      `;
    }
  }

  showResults(data) {
    this.resultData = data;
    const resultArea = this.shadowRoot.querySelector('.result-area');
    if (resultArea) {
      const viewer = document.createElement('sinna-results-viewer');
      if (this.theme) viewer.setAttribute('data-theme', this.theme);
      if (this.accent) viewer.setAttribute('data-accent', this.accent);
      viewer.setData(data);
      resultArea.innerHTML = '';
      resultArea.appendChild(viewer);
    }
  }

  // Override in subclasses to add developer UI
  renderDeveloperUI() {
    return '';
  }

  getStyles() {
    return `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        :host {
          display: block;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: var(--sinna-text-primary);
          --sinna-bg: #ffffff;
          --sinna-fg: #1a1a1a;
          --sinna-card-bg: #ffffff;
          --sinna-card-border: #e5e7eb;
          --sinna-accent: #0066cc;
          --sinna-accent-hover: #0052a3;
          --sinna-accent-light: #e7f3ff;
          --sinna-shadow: rgba(0, 0, 0, 0.1);
          --sinna-shadow-hover: rgba(0, 0, 0, 0.15);
          --sinna-shadow-lg: rgba(0, 0, 0, 0.2);
          --sinna-text-primary: #1a1a1a;
          --sinna-text-secondary: #666666;
          --sinna-text-muted: #999999;
          --sinna-border: #e5e7eb;
          --sinna-surface: #f8f9fa;
          --sinna-surface-hover: #e9ecef;
          --sinna-gradient-start: #667eea;
          --sinna-gradient-end: #764ba2;
        }

        .sinna-widget {
          max-width: 900px;
          margin: 0 auto;
          padding: 40px;
          background: var(--sinna-bg);
          border-radius: 16px;
          box-shadow: 0 4px 24px var(--sinna-shadow-lg);
          border: 1px solid var(--sinna-card-border);
          transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
        }

        .widget-header {
          margin-bottom: 32px;
          text-align: center;
        }

        .widget-header h3 {
          margin: 0 0 12px 0;
          font-size: 28px;
          font-weight: 700;
          background: linear-gradient(135deg, var(--sinna-gradient-start), var(--sinna-gradient-end));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.5px;
        }

        .subtitle {
          margin: 0;
          font-size: 15px;
          color: var(--sinna-text-secondary);
          font-weight: 400;
        }

        .preset-selection {
          margin-bottom: 32px;
        }

        .preset-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .preset-card {
          padding: 20px;
          background: var(--sinna-card-bg);
          border: 2px solid var(--sinna-card-border);
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s ease, border-color 0.3s ease;
          text-align: left;
          font-family: inherit;
          position: relative;
          overflow: hidden;
        }

        .preset-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--sinna-gradient-start), var(--sinna-gradient-end));
          transform: scaleX(0);
          transition: transform 0.3s ease;
        }

        .preset-card:hover:not(:disabled)::before {
          transform: scaleX(1);
        }

        .preset-card:hover:not(:disabled) {
          background: var(--sinna-surface-hover);
          border-color: var(--sinna-accent);
          transform: translateY(-4px) scale(1.02);
          box-shadow: 0 12px 24px var(--sinna-shadow-hover);
        }

        .preset-card.selected {
          background: var(--sinna-accent-light);
          border-color: var(--sinna-accent);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--sinna-accent) 10%, transparent), 0 8px 16px var(--sinna-shadow);
        }

        .preset-card.selected::before {
          transform: scaleX(1);
        }

        .preset-card:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none !important;
        }

        .preset-icon {
          font-size: 24px;
          margin-bottom: 8px;
          display: block;
        }

        .preset-label {
          font-weight: 600;
          font-size: 16px;
          color: var(--sinna-text-primary);
          margin-bottom: 6px;
          letter-spacing: -0.2px;
        }

        .preset-description {
          font-size: 13px;
          color: var(--sinna-text-secondary);
          line-height: 1.5;
        }

        .actions {
          display: flex;
          justify-content: center;
          margin-bottom: 32px;
        }

        .analyze-button {
          padding: 14px 40px;
          font-size: 16px;
          font-weight: 600;
          color: #ffffff;
          background: linear-gradient(135deg, var(--sinna-accent), var(--sinna-accent-hover));
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s ease, box-shadow 0.3s ease;
          font-family: inherit;
          position: relative;
          overflow: hidden;
          box-shadow: 0 4px 12px color-mix(in srgb, var(--sinna-accent) 30%, transparent);
        }

        .analyze-button::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.3);
          transform: translate(-50%, -50%);
          transition: width 0.6s, height 0.6s;
        }

        .analyze-button:hover:not(:disabled)::before {
          width: 300px;
          height: 300px;
        }

        .analyze-button:hover:not(:disabled) {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 8px 20px color-mix(in srgb, var(--sinna-accent) 40%, transparent);
        }

        .analyze-button:active:not(:disabled) {
          transform: translateY(0) scale(1);
        }

        .analyze-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          background: var(--sinna-text-muted);
          transform: none;
          box-shadow: none;
        }

        .result-area {
          margin-top: 32px;
          min-height: 100px;
        }

        .instant-banner {
          margin-bottom: 16px;
          padding: 12px 20px;
          background: linear-gradient(135deg, #fef3c7, #fde68a);
          border: 2px solid #f59e0b;
          border-radius: 8px;
          animation: fadeIn 0.3s ease;
        }

        .instant-banner-content {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13px;
        }

        .instant-badge {
          padding: 4px 10px;
          background: #f59e0b;
          color: white;
          border-radius: 4px;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .instant-text {
          color: #92400e;
          font-weight: 500;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .error-container {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 20px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 12px;
          color: #ef4444;
        }

        .error-icon {
          width: 24px;
          height: 24px;
          flex-shrink: 0;
          stroke-width: 2;
        }

        .error-message {
          font-size: 14px;
          font-weight: 500;
          line-height: 1.5;
        }

        .loading {
          text-align: center;
          padding: 40px;
          color: var(--sinna-text-secondary);
          font-size: 15px;
        }

        .loading-spinner {
          display: inline-block;
          width: 40px;
          height: 40px;
          border: 3px solid var(--sinna-border);
          border-top-color: var(--sinna-accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-bottom: 16px;
        }

        .loading-text {
          font-weight: 500;
          margin-top: 12px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .loading::after {
          content: '';
          animation: dots 1.5s steps(4, end) infinite;
        }

        @keyframes dots {
          0%, 20% { content: '.'; }
          40% { content: '..'; }
          60%, 100% { content: '...'; }
        }

        @media (max-width: 768px) {
          .sinna-widget {
            padding: 24px 20px;
            border-radius: 12px;
          }

          .widget-header h3 {
            font-size: 24px;
          }

          .preset-grid {
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            gap: 12px;
          }

          .preset-card {
            padding: 16px;
          }

          .preset-label {
            font-size: 15px;
          }

          .preset-description {
            font-size: 12px;
          }

          .analyze-button {
            padding: 12px 32px;
            font-size: 15px;
          }
        }
      </style>
    `;
  }

  render() {
    const presets = this.getPresets();
    const selectedPreset = this.selectedPreset;

    this.shadowRoot.innerHTML = `
      ${this.getStyles()}
      <div class="sinna-widget">
        ${this.renderDeveloperUI()}
        <div class="widget-header">
          <h3>Sinna Accessibility Presets</h3>
          <p class="subtitle">Select a preset to analyze your video</p>
        </div>

        <div class="preset-selection">
          <div class="preset-grid">
            ${presets.map(preset => `
              <button
                class="preset-card ${selectedPreset === preset.id ? 'selected' : ''}"
                data-preset-id="${preset.id}"
                ${this.processing ? 'disabled' : ''}
              >
                <span class="preset-icon">${preset.icon}</span>
                <div class="preset-label">${preset.label}</div>
                <div class="preset-description">${preset.description}</div>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="actions">
          <button
            class="analyze-button"
            ${!selectedPreset || this.processing ? 'disabled' : ''}
          >
            ${this.processing ? 'Processing…' : 'Analyze Video'}
          </button>
        </div>

        <div class="result-area">
          ${this.processing ? `
            <div class="loading">
              <div class="loading-spinner"></div>
              <div class="loading-text">Processing video<span class="loading-dots"></span></div>
              <div style="font-size: 13px; margin-top: 8px; color: var(--sinna-text-muted);">This may take a few minutes</div>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    // Attach event listeners
    const presetCards = this.shadowRoot.querySelectorAll('.preset-card');
    presetCards.forEach(card => {
      card.addEventListener('click', () => {
        if (!this.processing) {
          this.handlePresetSelect(card.dataset.presetId);
        }
      });
    });

    const analyzeButton = this.shadowRoot.querySelector('.analyze-button');
    if (analyzeButton) {
      analyzeButton.addEventListener('click', () => {
        if (!this.processing && selectedPreset) {
          this.handleAnalyze();
        }
      });
    }

    // Re-render ResultsViewer if we have result data
    if (this.resultData) {
      const resultArea = this.shadowRoot.querySelector('.result-area');
      if (resultArea) {
        const viewer = document.createElement('sinna-results-viewer');
        if (this.theme) viewer.setAttribute('data-theme', this.theme);
        if (this.accent) viewer.setAttribute('data-accent', this.accent);
        viewer.setData(this.resultData);
        resultArea.innerHTML = '';
        resultArea.appendChild(viewer);
      }
    }
  }
}

export default SinnaPresetBase;

