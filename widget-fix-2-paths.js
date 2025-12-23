// Fix 2: Demo Path Fixes
// Apply this fix to widget/demo/index.html

// FIND THIS (around line 240-250):
/*
        if (mode === 'developer') {
          script.src = '../dist/dev-widget.js';
        } else {
          script.src = 'https://cdn.sinna.site/widget.js';
        }
*/

// REPLACE WITH:
/*
        if (mode === 'developer') {
          script.src = '/dist/dev-widget.js';
        } else {
          script.src = 'https://cdn.sinna.site/widget.js';
        }
*/

// ALSO FIND initial load (around line 340):
// Ensure it uses '/dist/dev-widget.js' not '../dist/dev-widget.js'

