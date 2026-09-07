#!/usr/bin/env bash
# Build a local checksum inventory without database or cloud credentials.
set -euo pipefail
umask 077

usage() { echo "Usage: pg-backup-inventory.sh --backup-dir DIRECTORY [--output FILE]" >&2; }
backup_dir=
output=
while (($#)); do
  case "$1" in
    --backup-dir) backup_dir=${2-}; shift 2 ;;
    --output) output=${2-}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
done
[[ -n "$backup_dir" && -d "$backup_dir" ]] || { usage; exit 2; }
if command -v sha256sum >/dev/null 2>&1; then hasher=sha256sum
elif command -v shasum >/dev/null 2>&1; then hasher=shasum
else echo "sha256sum or shasum is required." >&2; exit 127
fi
output=${output:-"${backup_dir}/SHA256SUMS"}
tmp=$(mktemp "${TMPDIR:-/tmp}/pg-inventory.XXXXXX")
chmod 600 "$tmp"
trap 'rm -f -- "$tmp"' EXIT
find "$backup_dir" -maxdepth 1 -type f -name '*.dump' -print0 | sort -z |
  while IFS= read -r -d '' file; do
    if [[ "$hasher" == sha256sum ]]; then sum=$(sha256sum -- "$file" | awk '{print $1}')
    else sum=$(shasum -a 256 -- "$file" | awk '{print $1}')
    fi
    printf '%s  %s\n' "$sum" "$(basename "$file")"
  done > "$tmp"
mv -- "$tmp" "$output"
chmod 600 "$output"
printf 'Checksum inventory written: %s\n' "$output"