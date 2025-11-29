/**
 * CDN Deployment Script
 * Copies built widgets to CDN directory for static deployment
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const srcLive = path.resolve(rootDir, "widget/dist/widget.js");
const srcDev = path.resolve(rootDir, "widget/dist/dev-widget.js");
const destLive = path.resolve(rootDir, "cdn/widget.js");
const destDev = path.resolve(rootDir, "cdn/dev-widget.js");
const cdnDir = path.resolve(rootDir, "cdn");

// Ensure CDN directory exists
if (!fs.existsSync(cdnDir)) {
  fs.mkdirSync(cdnDir, { recursive: true });
  console.log("✓ Created cdn/ directory");
}

// Check if source files exist
if (!fs.existsSync(srcLive)) {
  console.error("✗ Error: dist/widget.js not found. Run 'npm run build' in widget/ first.");
  process.exit(1);
}

if (!fs.existsSync(srcDev)) {
  console.error("✗ Error: dist/dev-widget.js not found. Run 'npm run build' in widget/ first.");
  process.exit(1);
}

// Copy files
try {
  fs.copyFileSync(srcLive, destLive);
  fs.copyFileSync(srcDev, destDev);
  
  console.log("✓ CDN build updated");
  console.log("  - cdn/widget.js");
  console.log("  - cdn/dev-widget.js");
  console.log("\nReady for deployment to https://cdn.sinna.site/");
} catch (error) {
  console.error("✗ Error copying files:", error.message);
  process.exit(1);
}

