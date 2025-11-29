# Build Instructions

## Quick Build

```bash
cd widget
npm install
npm run build
```

This will create `widget.js` in the widget directory.

## Development

```bash
npm run dev
```

Watches for changes and rebuilds automatically.

## Testing Locally

```bash
npm run preview
```

Or open `demo/index.html` directly in a browser (after building).

## Manual Build (if npm fails)

If npm doesn't work, you can use esbuild directly:

```bash
npx esbuild src/index.js --bundle --format=esm --outfile=widget.js --target=es2020 --minify
```

