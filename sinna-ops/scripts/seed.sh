#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source the env into this shell so exports persist
. "$SCRIPT_DIR/export_env.sh"

# Build API then seed database
pnpm -C "$REPO_ROOT/apps/api" build
pnpm -C "$REPO_ROOT/apps/api" seed
echo "Seed complete."
