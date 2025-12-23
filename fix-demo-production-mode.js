// Fix Demo Production Mode Script Loading
// This script fixes the production mode to use local files instead of CDN

const fs = require('fs');
const path = require('path');

const demoHtmlPath = path.join(__dirname, 'widget/demo/index.html');

if (!fs.existsSync(demoHtmlPath)) {
    console.error('❌ widget/demo/index.html not found');
    process.exit(1);
}

console.log('🔧 Fixing production mode script loading...');

let content = fs.readFileSync(demoHtmlPath, 'utf8');

// Create backup
fs.writeFileSync(demoHtmlPath + '.bak', content);

// Replace CDN URL with local path for production mode
content = content.replace(
    /script\.src\s*=\s*['"]https:\/\/cdn\.sinna\.site\/widget\.js['"]/g,
    "script.src = '/dist/widget.js'"
);

// Also handle any other CDN references
content = content.replace(
    /https:\/\/cdn\.sinna\.site\/widget\.js/g,
    '/dist/widget.js'
);

// Add error handling for script loading
if (!content.includes('script.onerror')) {
    // Find the loadWidgetScript function and add error handling
    const loadWidgetScriptMatch = content.match(/(function\s+loadWidgetScript[^}]+)/);
    if (loadWidgetScriptMatch) {
        const funcStart = loadWidgetScriptMatch.index;
        const funcEnd = content.indexOf('}', funcStart);
        const funcContent = content.substring(funcStart, funcEnd);
        
        if (!funcContent.includes('script.onerror')) {
            // Add error handler before the script is appended
            content = content.replace(
                /(script\.type\s*=\s*['"]module['"];[\s\S]*?)(document\.body\.appendChild\(script\))/,
                `$1script.onerror = () => {
      reject(new Error('Failed to load widget script: ' + script.src));
    };
    $2`
            );
        }
    }
}

fs.writeFileSync(demoHtmlPath, content, 'utf8');

console.log('✓ Production mode now uses local /dist/widget.js');
console.log('✓ Added error handling for script loading');

