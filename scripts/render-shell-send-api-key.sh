#!/bin/bash
# Run this on Render Shell to manually create and send API key
# Usage: bash scripts/render-shell-send-api-key.sh ikennaokeke1996@gmail.com

EMAIL="${1:-ikennaokeke1996@gmail.com}"

cd /opt/render/project/src

echo "🔍 Checking for API key for: $EMAIL"
echo ""

# Run the script that creates/retrieves and sends API key
pnpm tsx scripts/manual-send-api-key.ts "$EMAIL"

