import esbuild from "esbuild";
import { mkdir, access, copyFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure dist directory exists
const distDir = 'dist';
try {
  await access(distDir);
} catch {
  await mkdir(distDir, { recursive: true });
}

console.log('Building widgets...\n');

// Build live widget (production)
console.log('Building live widget (widget.js)...');
await esbuild.build({
  entryPoints: ["src/liveIndex.js"],
  bundle: true,
  outfile: "dist/widget.js",
  minify: true,
  format: "esm",
  target: ["es2020"],
})
  .then(() => {
    console.log("✓ Built dist/widget.js successfully\n");
  })
  .catch((error) => {
    console.error("✗ Live widget build failed:", error);
    process.exit(1);
  });

// Build developer widget
console.log('Building developer widget (dev-widget.js)...');
await esbuild.build({
  entryPoints: ["src/devIndex.js"],
  bundle: true,
  outfile: "dist/dev-widget.js",
  minify: true,
  format: "esm",
  target: ["es2020"],
})
  .then(() => {
    console.log("✓ Built dist/dev-widget.js successfully\n");
  })
  .catch((error) => {
    console.error("✗ Developer widget build failed:", error);
    process.exit(1);
  });

// Copy sample JSON to dist for instant mode
try {
  const sampleDir = path.resolve(__dirname, 'dist/sample');
  try {
    await access(sampleDir);
  } catch {
    await mkdir(sampleDir, { recursive: true });
  }
  const sampleSrc = path.resolve(__dirname, 'sample/instant-demo.json');
  const sampleDest = path.resolve(__dirname, 'dist/sample/instant-demo.json');
  await copyFile(sampleSrc, sampleDest);
  console.log("✓ Copied sample/instant-demo.json to dist/\n");
} catch (error) {
  console.warn("⚠ Could not copy sample file (non-critical):", error.message);
}

console.log('✓ All widgets built successfully!');
console.log('\nOutput files:');
console.log('  - dist/widget.js (live/production)');
console.log('  - dist/dev-widget.js (developer)');
console.log('  - dist/sample/instant-demo.json (instant mode sample)');
