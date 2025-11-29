/**
 * Main widget entry point
 * Loads ResultsViewer first, then SinnaPreset
 */

// Import ResultsViewer first (registers 'sinna-results-viewer')
import './ResultsViewer.js';

// Then import SinnaPreset (uses 'sinna-results-viewer')
import './index.js';
