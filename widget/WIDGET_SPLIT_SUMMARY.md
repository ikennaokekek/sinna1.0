# Widget Split - Developer vs Live Versions

## ✅ Completed Implementation

### Overview
The Sinna widget has been successfully split into two versions:
1. **Developer Widget** (`dev-widget.js`) - For demos and documentation
2. **Live Widget** (`widget.js`) - For production use by clients

## 📁 File Structure

```
widget/
├── src/
│   ├── SinnaPresetBase.js    # Base widget class (shared core functionality)
│   ├── SinnaPresetDev.js     # Developer widget (extends base, adds dev UI)
│   ├── ResultsViewer.js      # Shared results viewer component
│   ├── liveIndex.js          # Entry point for live widget
│   ├── devIndex.js           # Entry point for developer widget
│   └── index.js              # (legacy, can be removed)
├── dist/
│   ├── widget.js             # Live/production widget (built)
│   └── dev-widget.js        # Developer widget (built)
├── demo/
│   └── index.html            # Demo page using dev-widget.js
└── build.js                  # Build script for both versions
```

## 🎯 Key Features

### Developer Widget (`dev-widget.js`)
✅ **Includes:**
- Theme toggle (Light/Dark dropdown)
- Accent color picker
- Demo banner ("DEV MODE" badge)
- Results viewer
- All developer UI controls

✅ **Use Case:**
- Documentation sites
- Demo pages
- Development/testing
- Internal tools

✅ **Usage:**
```html
<script type="module" src="../dist/dev-widget.js"></script>
<sinna-preset api-key="..." video-url="..."></sinna-preset>
```

### Live Widget (`widget.js`)
✅ **Excludes:**
- ❌ NO theme toggle
- ❌ NO accent color picker
- ❌ NO demo banner
- ❌ NO developer UI

✅ **Includes:**
- Core widget functionality
- Theme/accent support via HTML attributes
- Results viewer
- Clean, production-ready UI

✅ **Use Case:**
- Production deployments
- Client integrations (Netflix, Virgin, Sky)
- Public-facing applications

✅ **Usage:**
```html
<script type="module" src="https://cdn.sinna.site/widget.js"></script>
<sinna-preset
  api-key="sk_live_..."
  video-url="https://example.com/video.mp4"
  theme="dark"
  accent="#C3001D">
</sinna-preset>
```

## 🔧 Implementation Details

### Base Class (`SinnaPresetBase.js`)
- Contains all core widget functionality
- Theme system with CSS variables
- Preset selection and API integration
- Results display
- Shared by both versions

### Developer Class (`SinnaPresetDev.js`)
- Extends `SinnaPresetBase`
- Adds `renderDeveloperUI()` method
- Includes developer controls styling
- Wires up theme/accent controls internally

### Shared Components
- **ResultsViewer**: Used by both versions
- **Theme Variables**: Same CSS variable system
- **Web Component**: Both register as `<sinna-preset>`

## 🚀 Build Process

### Build Command
```bash
cd widget
npm install
npm run build
```

### Build Output
- `dist/widget.js` - Live/production widget (minified)
- `dist/dev-widget.js` - Developer widget (minified)

### Build Script Features
- Creates `dist/` directory if needed
- Builds both widgets in parallel
- Minifies both outputs
- Provides clear success/error messages

## 📝 Usage Examples

### Developer Widget (Demo)
```html
<!DOCTYPE html>
<html>
<head>
  <script type="module" src="../dist/dev-widget.js"></script>
</head>
<body>
  <sinna-preset
    api-key="sk_test_demo"
    video-url="https://example.com/video.mp4">
  </sinna-preset>
</body>
</html>
```

### Live Widget (Production)
```html
<!DOCTYPE html>
<html>
<head>
  <script type="module" src="https://cdn.sinna.site/widget.js"></script>
</head>
<body>
  <sinna-preset
    api-key="sk_live_abc123..."
    video-url="https://client-site.com/video.mp4"
    theme="dark"
    accent="#C3001D">
  </sinna-preset>
</body>
</html>
```

## ✨ Benefits

1. **Clean Production Widget**: No developer UI in production builds
2. **Better Developer Experience**: Built-in controls for demos/docs
3. **Shared Codebase**: Core functionality maintained in one place
4. **Easy Maintenance**: Changes to base class affect both versions
5. **Smaller Bundle**: Live widget excludes unused developer code

## 🔄 Migration Notes

### For Existing Users
- **No breaking changes**: Both widgets register as `<sinna-preset>`
- **Live widget**: Use `dist/widget.js` or CDN URL
- **Developer widget**: Use `dist/dev-widget.js` for demos

### Demo Page
- Updated to use `dev-widget.js`
- Removed external theme controls (now built into widget)
- Shows both usage examples

## 📦 Distribution

### CDN Deployment
- **Live Widget**: `https://cdn.sinna.site/widget.js`
- **Developer Widget**: `https://cdn.sinna.site/dev-widget.js` (optional)

### NPM Package (Future)
- Main entry: `widget.js` (live version)
- Dev entry: `dev-widget.js` (developer version)

## ✅ Verification Checklist

- [x] Base class contains all core functionality
- [x] Developer class extends base and adds UI
- [x] Both widgets register as `sinna-preset`
- [x] ResultsViewer shared between both
- [x] Theme variables shared
- [x] Build script creates both outputs
- [x] Demo page uses developer widget
- [x] Live widget excludes developer UI
- [x] No breaking changes to API
- [x] Both widgets support theme/accent attributes

## 🎉 Result

You now have:
- ✅ **Live production widget.js** - Used by clients like Netflix, Virgin, Sky
- ✅ **Developer dev-widget.js** - Used in documentation with color/theme tools

Both widgets are production-ready and maintain full functionality!

