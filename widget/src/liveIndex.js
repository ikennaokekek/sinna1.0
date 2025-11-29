/**
 * Live Widget Entry Point
 * Production version without developer UI
 */

// Import ResultsViewer first (registers 'sinna-results-viewer')
import './ResultsViewer.js';

// Import base widget class
import SinnaPresetBase from './SinnaPresetBase.js';

// Register as sinna-preset for production use
if (!customElements.get('sinna-preset')) {
  customElements.define('sinna-preset', SinnaPresetBase);
}

export default SinnaPresetBase;

