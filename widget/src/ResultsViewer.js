/**
 * Sinna Results Viewer Component
 * Displays analysis results in a premium, structured format
 */

class SinnaResultsViewer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.data = null;
  }

  static get observedAttributes() {
    return ['data', 'data-theme', 'data-accent'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'data' && oldValue !== newValue) {
      try {
        this.data = JSON.parse(newValue);
        this.render();
      } catch (e) {
        console.error('Invalid JSON data:', e);
      }
    } else if ((name === 'data-theme' || name === 'data-accent') && oldValue !== newValue) {
      this.updateTheme();
      this.render();
    }
  }

  updateTheme() {
    const theme = this.getAttribute('data-theme') || 'light';
    const accent = this.getAttribute('data-accent');
    const root = this.shadowRoot;
    if (!root) return;

    // Remove old theme style if exists
    const oldThemeStyle = root.querySelector('style[data-theme-vars]');
    if (oldThemeStyle) oldThemeStyle.remove();

    // Create new style element with CSS variables
    const style = document.createElement('style');
    style.setAttribute('data-theme-vars', 'true');
    
    const isDark = theme === 'dark';
    const accentColor = accent || (isDark ? '#3b82f6' : '#0066cc');
    
    const themeVars = {
      bg: isDark ? '#0f172a' : '#ffffff',
      fg: isDark ? '#f1f5f9' : '#1a1a1a',
      'card-bg': isDark ? '#1e293b' : '#ffffff',
      'card-border': isDark ? '#334155' : '#e5e7eb',
      accent: accentColor,
      'accent-hover': this.adjustBrightness(accentColor, isDark ? -15 : -10),
      'accent-light': this.adjustBrightness(accentColor, isDark ? 20 : 90),
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
    };
    
    style.textContent = `
      :host {
        ${Object.entries(themeVars).map(([key, value]) => `--sinna-${key}: ${value};`).join('\n        ')}
      }
    `;
    
    root.appendChild(style);
  }

  adjustBrightness(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + percent));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + percent));
    const b = Math.min(255, Math.max(0, (num & 0x0000FF) + percent));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  connectedCallback() {
    // If data is set via property instead of attribute
    if (this.data) {
      this.updateTheme();
      this.render();
    } else {
      this.updateTheme();
    }
  }

  setData(data) {
    this.data = data;
    this.render();
  }

  formatTimecode(seconds) {
    if (typeof seconds !== 'number') return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  getSeverityBadge(severity) {
    const severityMap = {
      info: { label: 'Info', color: 'var(--sinna-info)', bg: 'rgba(59, 130, 246, 0.1)' },
      warning: { label: 'Warning', color: 'var(--sinna-warning)', bg: 'rgba(245, 158, 11, 0.1)' },
      danger: { label: 'Critical', color: 'var(--sinna-danger)', bg: 'rgba(239, 68, 68, 0.1)' },
      success: { label: 'Success', color: 'var(--sinna-success)', bg: 'rgba(16, 185, 129, 0.1)' },
    };
    return severityMap[severity] || severityMap.info;
  }

  renderTimeline(events) {
    if (!events || !Array.isArray(events) || events.length === 0) {
      return '';
    }

    return `
      <div class="timeline-section">
        <h4 class="section-title">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          Timeline Events
        </h4>
        <div class="timeline">
          ${events.map((event, idx) => `
            <div class="timeline-item">
              <div class="timeline-marker"></div>
              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="timeline-time">${this.formatTimecode(event.time || event.timestamp || 0)}</span>
                  ${event.severity ? `<span class="severity-badge severity-${event.severity}">${this.getSeverityBadge(event.severity).label}</span>` : ''}
                </div>
                <div class="timeline-title">${event.title || event.type || 'Event'}</div>
                ${event.description ? `<div class="timeline-description">${event.description}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderInsights(insights) {
    if (!insights || !Array.isArray(insights) || insights.length === 0) {
      return '';
    }

    return `
      <div class="insights-section">
        <h4 class="section-title">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5"></path>
          </svg>
          Insights
        </h4>
        <div class="insights-grid">
          ${insights.map((insight, idx) => {
            const badge = this.getSeverityBadge(insight.severity || 'info');
            return `
              <div class="insight-card">
                <div class="insight-header">
                  <span class="insight-title">${insight.title || insight.type || 'Insight'}</span>
                  ${insight.severity ? `<span class="severity-badge severity-${insight.severity}" style="--badge-color: ${badge.color}; --badge-bg: ${badge.bg}">${badge.label}</span>` : ''}
                </div>
                ${insight.description ? `<div class="insight-description">${insight.description}</div>` : ''}
                ${insight.value !== undefined ? `<div class="insight-value">${insight.value}</div>` : ''}
                ${insight.recommendation ? `<div class="insight-recommendation">💡 ${insight.recommendation}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  renderSummary(summary) {
    if (!summary) return '';

    return `
      <div class="summary-banner">
        <div class="summary-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>
        <div class="summary-content">
          <h3 class="summary-title">Analysis Complete</h3>
          <p class="summary-text">${summary.message || summary.text || 'Video analysis has been completed successfully.'}</p>
        </div>
      </div>
    `;
  }

  getStyles() {
    return `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        :host {
          display: block;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          color: var(--sinna-text-primary, #1a1a1a);
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
          --sinna-success: #10b981;
          --sinna-warning: #f59e0b;
          --sinna-danger: #ef4444;
          --sinna-info: #3b82f6;
        }

        :host([data-theme="dark"]) {
          --sinna-bg: #0f172a;
          --sinna-fg: #f1f5f9;
          --sinna-card-bg: #1e293b;
          --sinna-card-border: #334155;
          --sinna-accent: #3b82f6;
          --sinna-accent-hover: #2563eb;
          --sinna-accent-light: #1e3a8a;
          --sinna-shadow: rgba(0, 0, 0, 0.3);
          --sinna-shadow-hover: rgba(0, 0, 0, 0.4);
          --sinna-shadow-lg: rgba(0, 0, 0, 0.5);
          --sinna-text-primary: #f1f5f9;
          --sinna-text-secondary: #cbd5e1;
          --sinna-text-muted: #94a3b8;
          --sinna-border: #334155;
          --sinna-surface: #1e293b;
          --sinna-surface-hover: #334155;
        }

        .results-container {
          max-width: 900px;
          margin: 0 auto;
        }

        .summary-banner {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 24px;
          background: linear-gradient(135deg, var(--sinna-accent-light), rgba(255, 255, 255, 0.1));
          border-radius: 16px;
          margin-bottom: 32px;
          border: 1px solid var(--sinna-card-border);
        }

        .summary-icon {
          flex-shrink: 0;
          width: 48px;
          height: 48px;
          background: var(--sinna-accent);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }

        .summary-icon svg {
          width: 24px;
          height: 24px;
          stroke-width: 2.5;
        }

        .summary-content {
          flex: 1;
        }

        .summary-title {
          margin: 0 0 4px 0;
          font-size: 20px;
          font-weight: 600;
          color: var(--sinna-text-primary);
        }

        .summary-text {
          margin: 0;
          font-size: 14px;
          color: var(--sinna-text-secondary);
          line-height: 1.5;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 16px 0;
          font-size: 18px;
          font-weight: 600;
          color: var(--sinna-text-primary);
        }

        .section-title .icon {
          width: 20px;
          height: 20px;
          stroke-width: 2;
          color: var(--sinna-accent);
        }

        .insights-section,
        .timeline-section {
          margin-bottom: 32px;
        }

        .insights-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .insight-card {
          padding: 20px;
          background: var(--sinna-card-bg);
          border: 1px solid var(--sinna-card-border);
          border-radius: 12px;
          transition: all 0.2s ease;
        }

        .insight-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px var(--sinna-shadow);
          border-color: var(--sinna-accent);
        }

        .insight-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
        }

        .insight-title {
          font-weight: 600;
          font-size: 15px;
          color: var(--sinna-text-primary);
        }

        .insight-description {
          font-size: 14px;
          color: var(--sinna-text-secondary);
          line-height: 1.5;
          margin-bottom: 8px;
        }

        .insight-value {
          font-size: 16px;
          font-weight: 600;
          color: var(--sinna-accent);
          margin-top: 8px;
        }

        .insight-recommendation {
          margin-top: 12px;
          padding: 12px;
          background: var(--sinna-surface);
          border-radius: 8px;
          font-size: 13px;
          color: var(--sinna-text-secondary);
          border-left: 3px solid var(--sinna-accent);
        }

        .severity-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          background: var(--badge-bg, rgba(59, 130, 246, 0.1));
          color: var(--badge-color, var(--sinna-info));
        }

        .timeline {
          position: relative;
          padding-left: 24px;
        }

        .timeline::before {
          content: '';
          position: absolute;
          left: 7px;
          top: 0;
          bottom: 0;
          width: 2px;
          background: var(--sinna-border);
        }

        .timeline-item {
          position: relative;
          margin-bottom: 24px;
        }

        .timeline-marker {
          position: absolute;
          left: -20px;
          top: 4px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--sinna-accent);
          border: 3px solid var(--sinna-card-bg);
          box-shadow: 0 0 0 2px var(--sinna-accent);
        }

        .timeline-content {
          padding: 16px;
          background: var(--sinna-card-bg);
          border: 1px solid var(--sinna-card-border);
          border-radius: 12px;
          transition: all 0.2s ease;
        }

        .timeline-content:hover {
          transform: translateX(4px);
          box-shadow: 0 4px 12px var(--sinna-shadow);
        }

        .timeline-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .timeline-time {
          font-weight: 600;
          font-size: 13px;
          color: var(--sinna-accent);
          font-variant-numeric: tabular-nums;
        }

        .timeline-title {
          font-weight: 600;
          font-size: 15px;
          color: var(--sinna-text-primary);
          margin-bottom: 4px;
        }

        .timeline-description {
          font-size: 14px;
          color: var(--sinna-text-secondary);
          line-height: 1.5;
        }

        .raw-data {
          margin-top: 32px;
          padding: 20px;
          background: var(--sinna-surface);
          border-radius: 12px;
          border: 1px solid var(--sinna-border);
        }

        .raw-data-title {
          font-weight: 600;
          font-size: 14px;
          color: var(--sinna-text-secondary);
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .raw-data pre {
          margin: 0;
          padding: 0;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          font-size: 12px;
          line-height: 1.6;
          color: var(--sinna-text-primary);
          white-space: pre-wrap;
          word-wrap: break-word;
          overflow-x: auto;
        }

        @media (max-width: 768px) {
          .insights-grid {
            grid-template-columns: 1fr;
          }

          .summary-banner {
            flex-direction: column;
            text-align: center;
          }

          .timeline {
            padding-left: 20px;
          }
        }
      </style>
    `;
  }

  render() {
    if (!this.data) {
      this.shadowRoot.innerHTML = `
        ${this.getStyles()}
        <div class="results-container">
          <div class="summary-banner">
            <div class="summary-content">
              <p class="summary-text">No data to display</p>
            </div>
          </div>
        </div>
      `;
      return;
    }

    const summary = this.data.summary || this.data;
    const insights = this.data.insights || this.data.results || [];
    const timeline = this.data.timeline || this.data.events || [];

    this.shadowRoot.innerHTML = `
      ${this.getStyles()}
      <div class="results-container">
        ${this.renderSummary(summary)}
        ${this.renderInsights(insights)}
        ${this.renderTimeline(timeline)}
        <div class="raw-data">
          <div class="raw-data-title">Raw Data</div>
          <pre>${JSON.stringify(this.data, null, 2)}</pre>
        </div>
      </div>
    `;
  }
}

// Register the custom element
customElements.define('sinna-results-viewer', SinnaResultsViewer);

export default SinnaResultsViewer;

