# CDN Directory

This directory contains the built widget files ready for CDN deployment.

## Files

- `widget.js` - Live/production widget
- `dev-widget.js` - Developer widget
- `_headers` - CDN headers for CORS and caching

## Deployment

Deploy this directory as a static site to:
- `https://cdn.sinna.site/`

## Usage

### Live Widget (Production)
```html
<script type="module" src="https://cdn.sinna.site/widget.js"></script>
<sinna-preset
  api-key="sk_live_..."
  video-url="https://example.com/video.mp4"
  theme="dark"
  accent="#C3001D">
</sinna-preset>
```

### Developer Widget
```html
<script type="module" src="https://cdn.sinna.site/dev-widget.js"></script>
<sinna-preset api-key="..." video-url="..."></sinna-preset>
```

## Updating CDN Files

Run from project root:
```bash
npm run deploy:cdn
```

This copies files from `widget/dist/` to `cdn/`.

