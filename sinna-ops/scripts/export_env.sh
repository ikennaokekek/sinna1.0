#!/usr/bin/env bash
set -euo pipefail

# Resolve repo root from this script's location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Duplicate env.example → .env.local and fill values."
  exit 1
fi

# Export variables from .env.local
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "Exported environment from $ENV_FILE"
