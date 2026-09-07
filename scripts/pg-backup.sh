#!/usr/bin/env bash
# Create a PostgreSQL logical backup. This script never reads DATABASE_URL.
set -euo pipefail
umask 077

usage() {
  cat <<'EOF'
Usage: pg-backup.sh --database-url-env NAME --output-dir DIRECTORY

Creates a pg_dump custom-format archive, a SHA-256 checksum, and a manifest.
NAME is the name of an already-set environment variable containing the database
URL. No default variable is used and the URL is never printed.
EOF
}

database_url_env=
output_dir=
while (($#)); do
  case "$1" in
    --database-url-env) database_url_env=${2-}; shift 2 ;;
    --output-dir) output_dir=${2-}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Invalid argument. Run with --help for usage." >&2; exit 2 ;;
  esac
done
[[ -n "$database_url_env" && -n "$output_dir" ]] || { usage >&2; exit 2; }
[[ "$database_url_env" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
  echo "Database URL environment variable name is invalid." >&2; exit 2;
}
database_url=${!database_url_env-}
[[ -n "$database_url" ]] || { echo "Database URL environment variable is unset or empty." >&2; exit 2; }
command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump is required." >&2; exit 127; }
command -v node >/dev/null 2>&1 || { echo "Node.js is required to prepare the PostgreSQL service file." >&2; exit 127; }
command -v sha256sum >/dev/null 2>&1 || command -v shasum >/dev/null 2>&1 || {
  echo "sha256sum or shasum is required." >&2; exit 127;
}

mkdir -p -- "$output_dir"
chmod 700 -- "$output_dir"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
base="postgres-${timestamp}"
archive="${output_dir}/${base}.dump"
manifest="${output_dir}/${base}.manifest"
temporary_archive="${archive}.partial"
error_log=$(mktemp "${TMPDIR:-/tmp}/pg-backup.XXXXXX")
service_file=$(mktemp "${TMPDIR:-/tmp}/pg-service.XXXXXX")
chmod 600 "$error_log"
chmod 600 "$service_file"
cleanup() { rm -f -- "$temporary_archive" "$error_log" "$service_file"; }
trap cleanup EXIT
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
node "$script_dir/lib/write-pg-service.mjs" "$database_url_env" "$service_file" dr_backup
# Do not leave the credential-bearing variable in pg_dump's environment.
unset "$database_url_env"
unset database_url

# A custom archive is portable across PostgreSQL installations and supports
# selective/parallel restore. stderr is withheld to avoid leaking a URL.
if ! PGSERVICEFILE="$service_file" PGSERVICE=dr_backup pg_dump --format=custom --no-owner --no-privileges \
  --file="$temporary_archive" 2>"$error_log"; then
  echo "pg_dump failed; no backup was retained. Review PostgreSQL access securely." >&2
  exit 1
fi
mv -- "$temporary_archive" "$archive"

if command -v sha256sum >/dev/null 2>&1; then
  checksum=$(sha256sum -- "$archive" | awk '{print $1}')
else
  checksum=$(shasum -a 256 -- "$archive" | awk '{print $1}')
fi
bytes=$(wc -c < "$archive" | tr -d '[:space:]')
{
  printf 'format=pg_dump_custom\n'
  printf 'created_at_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'archive=%s\n' "$(basename "$archive")"
  printf 'sha256=%s\n' "$checksum"
  printf 'bytes=%s\n' "$bytes"
  printf 'pg_dump_version=%s\n' "$(pg_dump --version)"
} > "$manifest"
chmod 600 -- "$archive" "$manifest"
printf 'Backup created: %s\nManifest: %s\n' "$archive" "$manifest"