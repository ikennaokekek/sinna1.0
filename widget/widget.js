var r=class extends HTMLElement{constructor(){super(),this.attachShadow({mode:"open"}),this.data=null}static get observedAttributes(){return["data","data-theme","data-accent"]}attributeChangedCallback(t,e,i){if(t==="data"&&e!==i)try{this.data=JSON.parse(i),this.render()}catch(s){console.error("Invalid JSON data:",s)}else(t==="data-theme"||t==="data-accent")&&e!==i&&this.render()}connectedCallback(){this.data&&this.render()}setData(t){this.data=t,this.render()}formatTimecode(t){if(typeof t!="number")return"N/A";let e=Math.floor(t/60),i=Math.floor(t%60);return`${e}:${i.toString().padStart(2,"0")}`}getSeverityBadge(t){let e={info:{label:"Info",color:"var(--sinna-info)",bg:"rgba(59, 130, 246, 0.1)"},warning:{label:"Warning",color:"var(--sinna-warning)",bg:"rgba(245, 158, 11, 0.1)"},danger:{label:"Critical",color:"var(--sinna-danger)",bg:"rgba(239, 68, 68, 0.1)"},success:{label:"Success",color:"var(--sinna-success)",bg:"rgba(16, 185, 129, 0.1)"}};return e[t]||e.info}renderTimeline(t){return!t||!Array.isArray(t)||t.length===0?"":`
      <div class="timeline-section">
        <h4 class="section-title">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          Timeline Events
        </h4>
        <div class="timeline">
          ${t.map((e,i)=>`
            <div class="timeline-item">
              <div class="timeline-marker"></div>
              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="timeline-time">${this.formatTimecode(e.time||e.timestamp||0)}</span>
                  ${e.severity?`<span class="severity-badge severity-${e.severity}">${this.getSeverityBadge(e.severity).label}</span>`:""}
                </div>
                <div class="timeline-title">${e.title||e.type||"Event"}</div>
                ${e.description?`<div class="timeline-description">${e.description}</div>`:""}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `}renderInsights(t){return!t||!Array.isArray(t)||t.length===0?"":`
      <div class="insights-section">
        <h4 class="section-title">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5"></path>
          </svg>
          Insights
        </h4>
        <div class="insights-grid">
          ${t.map((e,i)=>{let s=this.getSeverityBadge(e.severity||"info");return`
              <div class="insight-card">
                <div class="insight-header">
                  <span class="insight-title">${e.title||e.type||"Insight"}</span>
                  ${e.severity?`<span class="severity-badge severity-${e.severity}" style="--badge-color: ${s.color}; --badge-bg: ${s.bg}">${s.label}</span>`:""}
                </div>
                ${e.description?`<div class="insight-description">${e.description}</div>`:""}
                ${e.value!==void 0?`<div class="insight-value">${e.value}</div>`:""}
                ${e.recommendation?`<div class="insight-recommendation">\u{1F4A1} ${e.recommendation}</div>`:""}
              </div>
            `}).join("")}
        </div>
      </div>
    `}renderSummary(t){return t?`
      <div class="summary-banner">
        <div class="summary-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>
        <div class="summary-content">
          <h3 class="summary-title">Analysis Complete</h3>
          <p class="summary-text">${t.message||t.text||"Video analysis has been completed successfully."}</p>
        </div>
      </div>
    `:""}getStyles(){return`
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
    `}render(){if(!this.data){this.shadowRoot.innerHTML=`
        ${this.getStyles()}
        <div class="results-container">
          <div class="summary-banner">
            <div class="summary-content">
              <p class="summary-text">No data to display</p>
            </div>
          </div>
        </div>
      `;return}let t=this.data.summary||this.data,e=this.data.insights||this.data.results||[],i=this.data.timeline||this.data.events||[];this.shadowRoot.innerHTML=`
      ${this.getStyles()}
      <div class="results-container">
        ${this.renderSummary(t)}
        ${this.renderInsights(e)}
        ${this.renderTimeline(i)}
        <div class="raw-data">
          <div class="raw-data-title">Raw Data</div>
          <pre>${JSON.stringify(this.data,null,2)}</pre>
        </div>
      </div>
    `}};customElements.define("sinna-results-viewer",r);var o=class extends HTMLElement{constructor(){super(),this.attachShadow({mode:"open"}),this.selectedPreset=null,this.processing=!1,this.apiKey=null,this.videoUrl=null,this.theme="light",this.accent=null,this.resultData=null}static get observedAttributes(){return["api-key","video-url","theme","accent"]}attributeChangedCallback(t,e,i){e!==i&&(t==="api-key"?this.apiKey=i:t==="video-url"?this.videoUrl=i:t==="theme"?(this.theme=i||"light",this.updateTheme()):t==="accent"&&(this.accent=i,this.updateTheme()),this.render())}connectedCallback(){this.apiKey=this.getAttribute("api-key"),this.videoUrl=this.getAttribute("video-url"),this.theme=this.getAttribute("theme")||"light",this.accent=this.getAttribute("accent"),this.updateTheme(),this.render()}updateTheme(){if(this.theme?this.setAttribute("data-theme",this.theme):this.removeAttribute("data-theme"),this.accent){let t=this.shadowRoot;if(t){let e=document.createElement("style");e.textContent=`
          :host {
            --sinna-accent: ${this.accent};
            --sinna-accent-hover: ${this.adjustBrightness(this.accent,-10)};
            --sinna-accent-light: ${this.adjustBrightness(this.accent,90)};
          }
        `;let i=t.querySelector("style[data-accent]");i&&i.remove(),e.setAttribute("data-accent","true"),t.appendChild(e)}}}adjustBrightness(t,e){let i=parseInt(t.replace("#",""),16),s=Math.min(255,Math.max(0,(i>>16)+e)),a=Math.min(255,Math.max(0,(i>>8&255)+e)),n=Math.min(255,Math.max(0,(i&255)+e));return`#${(s<<16|a<<8|n).toString(16).padStart(6,"0")}`}getPresets(){return[{id:"everyday",label:"Everyday",description:"Balanced defaults",icon:"\u2696\uFE0F"},{id:"autism",label:"Autism",description:"Reduced motion, calm colors",icon:"\u{1F9E9}"},{id:"adhd",label:"ADHD",description:"Motion reduction, faster playback",icon:"\u26A1"},{id:"cognitive",label:"Cognitive",description:"Simplified language",icon:"\u{1F9E0}"},{id:"deaf",label:"Deaf",description:"Burned captions, volume boost",icon:"\u{1F442}"},{id:"blindness",label:"Blindness",description:"Audio description mixing",icon:"\u{1F441}\uFE0F"},{id:"color_blindness",label:"Color Blindness",description:"Color-safe palette",icon:"\u{1F3A8}"},{id:"epilepsy_flash",label:"Epilepsy (Flash)",description:"Flash reduction",icon:"\u26A1"},{id:"epilepsy_noise",label:"Epilepsy (Noise)",description:"Audio smoothing",icon:"\u{1F50A}"},{id:"low_vision",label:"Low Vision",description:"High contrast, large text",icon:"\u{1F50D}"},{id:"hoh",label:"Hard of Hearing",description:"Descriptive captions",icon:"\u{1F4E2}"},{id:"motion",label:"Motion Sensitivity",description:"Motion sensitivity",icon:"\u{1F30A}"},{id:"cognitive_load",label:"Cognitive Load",description:"Simplified transitions",icon:"\u{1F4CA}"}]}handlePresetSelect(t){this.selectedPreset=t,this.render()}async handleAnalyze(){if(!this.apiKey){this.showError("API key is required. Set the api-key attribute.");return}if(!this.videoUrl){this.showError("Video URL is required. Set the video-url attribute.");return}if(!this.selectedPreset){this.showError("Please select a preset.");return}this.processing=!0,this.resultData=null,this.render();try{let t=await fetch("https://sinna.site/v1/jobs",{method:"POST",headers:{"X-API-Key":this.apiKey,"Content-Type":"application/json"},body:JSON.stringify({source_url:this.videoUrl,preset_id:this.selectedPreset})}),e=await t.json();if(!t.ok)throw new Error(e.error||`HTTP ${t.status}: ${t.statusText}`);let i=e.data.id;this.pollJobStatus(i)}catch(t){this.processing=!1,this.showError(`Failed to create job: ${t.message}`),this.render()}}async pollJobStatus(t,e=120){let i=0,s=async()=>{i++;try{let a=await fetch(`https://sinna.site/v1/jobs/${t}`,{headers:{"X-API-Key":this.apiKey}}),n=await a.json();if(!a.ok)throw new Error(n.error||`HTTP ${a.status}`);let d=n.data.status;if(d==="completed"){this.processing=!1,this.resultData=n.data,this.showResults(n.data),this.render();return}if(d==="failed"){this.processing=!1,this.showError("Job processing failed. Check the API response for details."),this.render();return}i<e?setTimeout(s,2e3):(this.processing=!1,this.showError("Job processing timed out. The job may still be processing."),this.render())}catch(a){this.processing=!1,this.showError(`Failed to check job status: ${a.message}`),this.render()}};s()}showError(t){let e=this.shadowRoot.querySelector(".result-area");e&&(e.innerHTML=`
        <div class="error-container">
          <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div class="error-message">${t}</div>
        </div>
      `)}showResults(t){this.resultData=t;let e=this.shadowRoot.querySelector(".result-area");if(e){let i=document.createElement("sinna-results-viewer");this.theme&&i.setAttribute("data-theme",this.theme),this.accent&&i.setAttribute("data-accent",this.accent),i.setData(t),e.innerHTML="",e.appendChild(i)}}getStyles(){return`
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        :host {
          display: block;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          font-size: 14px;
          line-height: 1.6;
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
          --sinna-gradient-start: #667eea;
          --sinna-gradient-end: #764ba2;
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

        .sinna-widget {
          max-width: 900px;
          margin: 0 auto;
          padding: 40px;
          background: var(--sinna-bg);
          border-radius: 16px;
          box-shadow: 0 4px 24px var(--sinna-shadow-lg);
          border: 1px solid var(--sinna-card-border);
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
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
          box-shadow: 0 0 0 4px rgba(var(--sinna-accent-rgb, 0, 102, 204), 0.1), 0 8px 16px var(--sinna-shadow);
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
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          font-family: inherit;
          position: relative;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(var(--sinna-accent-rgb, 0, 102, 204), 0.3);
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
          box-shadow: 0 8px 20px rgba(var(--sinna-accent-rgb, 0, 102, 204), 0.4);
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
    `}render(){let t=this.getPresets(),e=this.selectedPreset;this.shadowRoot.innerHTML=`
      ${this.getStyles()}
      <div class="sinna-widget">
        <div class="widget-header">
          <h3>Sinna Accessibility Presets</h3>
          <p class="subtitle">Select a preset to analyze your video</p>
        </div>

        <div class="preset-selection">
          <div class="preset-grid">
            ${t.map(a=>`
              <button
                class="preset-card ${e===a.id?"selected":""}"
                data-preset-id="${a.id}"
                ${this.processing?"disabled":""}
              >
                <span class="preset-icon">${a.icon}</span>
                <div class="preset-label">${a.label}</div>
                <div class="preset-description">${a.description}</div>
              </button>
            `).join("")}
          </div>
        </div>

        <div class="actions">
          <button
            class="analyze-button"
            ${!e||this.processing?"disabled":""}
          >
            ${this.processing?"Processing\u2026":"Analyze Video"}
          </button>
        </div>

        <div class="result-area">
          ${this.processing?`
            <div class="loading">
              <div class="loading-spinner"></div>
              <div class="loading-text">Processing video<span class="loading-dots"></span></div>
              <div style="font-size: 13px; margin-top: 8px; color: var(--sinna-text-muted);">This may take a few minutes</div>
            </div>
          `:""}
        </div>
      </div>
    `,this.shadowRoot.querySelectorAll(".preset-card").forEach(a=>{a.addEventListener("click",()=>{this.processing||this.handlePresetSelect(a.dataset.presetId)})});let s=this.shadowRoot.querySelector(".analyze-button");if(s&&s.addEventListener("click",()=>{!this.processing&&e&&this.handleAnalyze()}),this.resultData){let a=this.shadowRoot.querySelector(".result-area");if(a){let n=document.createElement("sinna-results-viewer");n.setData(this.resultData),a.innerHTML="",a.appendChild(n)}}}};customElements.define("sinna-preset",o);
