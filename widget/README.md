# Sinna Preset Widget

A Web Component-based widget for integrating Sinna accessibility presets into any website.

## Quick Start

### 1. Include the Script

Add this to your HTML:

```html
<script src="https://cdn.sinna.site/widget.js" type="module"></script>
```

### 2. Add the Widget

Place the widget element anywhere on your page:

```html
<sinna-preset
  api-key="sk_live_YOUR_API_KEY"
  video-url="https://example.com/video.mp4">
</sinna-preset>
```

That's it! The widget will automatically initialize and be ready to use.

## Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `api-key` | Yes | Your Sinna API key (starts with `sk_live_...`) |
| `video-url` | Yes | Public URL of the video to analyze |

## Features

- ✅ **13 Accessibility Presets** - Choose from everyday, autism, adhd, cognitive, deaf, blindness, and more
- ✅ **Clean UI** - Modern card-based interface
- ✅ **Real-time Processing** - Polls job status automatically
- ✅ **Error Handling** - Clear error messages
- ✅ **Responsive Design** - Works on mobile and desktop
- ✅ **Zero Dependencies** - Pure Web Components, no frameworks

## Available Presets

| Preset ID | Label | Description |
|-----------|-------|-------------|
| `everyday` | Everyday | Balanced defaults |
| `autism` | Autism | Reduced motion, calm colors |
| `adhd` | ADHD | Motion reduction, faster playback |
| `cognitive` | Cognitive | Simplified language |
| `deaf` | Deaf | Burned captions, volume boost |
| `blindness` | Blindness | Audio description mixing |
| `color_blindness` | Color Blindness | Color-safe palette |
| `epilepsy_flash` | Epilepsy (Flash) | Flash reduction |
| `epilepsy_noise` | Epilepsy (Noise) | Audio smoothing |
| `low_vision` | Low Vision | High contrast, large text |
| `hoh` | Hard of Hearing | Descriptive captions |
| `motion` | Motion Sensitivity | Motion sensitivity |
| `cognitive_load` | Cognitive Load | Simplified transitions |

## Usage Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Video Site</title>
</head>
<body>
  <h1>Video Accessibility</h1>
  
  <sinna-preset
    api-key="sk_live_YOUR_API_KEY"
    video-url="https://your-video-service.com/video.mp4">
  </sinna-preset>

  <script src="https://cdn.sinna.site/widget.js" type="module"></script>
</body>
</html>
```

## How It Works

1. **User selects a preset** from the grid of options
2. **Clicks "Analyze"** button
3. **Widget creates a job** via Sinna API (`POST /v1/jobs`)
4. **Polls for status** every 2 seconds until complete
5. **Displays results** in JSON format

## API Integration

The widget integrates with the Sinna API:

- **Endpoint:** `https://sinna.site/v1/jobs`
- **Method:** `POST`
- **Headers:** 
  - `X-API-Key: [your-api-key]`
  - `Content-Type: application/json`
- **Body:**
  ```json
  {
    "source_url": "https://example.com/video.mp4",
    "preset_id": "autism"
  }
  ```

## Development

### Build

```bash
npm install
npm run build
```

This creates `widget.js` in the root directory.

### Development Mode

```bash
npm run dev
```

Watches for changes and rebuilds automatically.

### Local Demo

```bash
npm run preview
```

Serves the demo at `http://localhost:3000`

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Any browser with Web Components support

## Styling

The widget includes its own styles and is self-contained. To customize:

1. Build from source
2. Modify `src/styles.css`
3. Rebuild

## License

MIT

## Support

- **Documentation:** https://sinna.site/api-docs
- **Support Email:** motion24inc@gmail.com

