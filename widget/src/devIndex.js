/**
 * Developer Widget Entry Point
 * Includes developer UI: theme toggle, accent color picker, demo banner
 */

// Import ResultsViewer first (registers 'sinna-results-viewer')
import './ResultsViewer.js';

// Import developer widget class
import SinnaPresetDev from './SinnaPresetDev.js';

// Register as sinna-preset for developer use
if (!customElements.get('sinna-preset')) {
  customElements.define('sinna-preset', SinnaPresetDev);
}

export default SinnaPresetDev;

