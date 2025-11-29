# Build and Run Instructions

## Quick Start

### 1. Install Dependencies
```bash
cd widget
npm install
```

### 2. Build Both Widgets
```bash
npm run build
```

This will create:
- `dist/widget.js` - Live/production widget
- `dist/dev-widget.js` - Developer widget

### 3. Preview the Demo
```bash
npm run preview
```

Then open: `http://localhost:8080` (or the port shown)

## Manual Build

If `npm run build` doesn't work, try:

```bash
node build.js
```

## Verify Build Success

After building, check:
```bash
ls -la dist/
```

You should see:
- `dist/widget.js`
- `dist/dev-widget.js`

## Test the Widgets

### Developer Widget (Demo)
Open `demo/index.html` in a browser. It uses `dist/dev-widget.js` and includes:
- Theme toggle
- Accent color picker
- Demo banner

### Live Widget (Production)
Create a test HTML file:
```html
<!DOCTYPE html>
<html>
<head>
  <script type="module" src="dist/widget.js"></script>
</head>
<body>
  <sinna-preset
    api-key="sk_test_demo"
    video-url="https://example.com/video.mp4"
    theme="dark"
    accent="#C3001D">
  </sinna-preset>
</body>
</html>
```

## Troubleshooting

### If build fails:
1. Check Node.js version: `node --version` (should be 18+)
2. Check npm version: `npm --version`
3. Reinstall dependencies: `rm -rf node_modules && npm install`
4. Check for errors in `build.js` syntax

### If preview doesn't work:
1. Install serve globally: `npm install -g serve`
2. Or use Python: `python3 -m http.server 8080` (in demo directory)
3. Or use any static file server

## Expected Output

When build succeeds, you should see:
```
Building widgets...

Building live widget (widget.js)...
✓ Built dist/widget.js successfully

Building developer widget (dev-widget.js)...
✓ Built dist/dev-widget.js successfully

✓ All widgets built successfully!

Output files:
  - dist/widget.js (live/production)
  - dist/dev-widget.js (developer)
```

