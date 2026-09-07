#!/usr/bin/env bash
# Run a logical backup and destructive restore drill only against caller-provided local fixtures.
set -euo pipefail
umask 077

usage() {
  cat <<'EOF'
Usage: pg-disposable-drill.sh --source-url-env NAME --target-url-env NAME --output-dir DIRECTORY

Both NAME values must name already-set environment variables. This script does
not provision databases or cloud resources. Use only disposable local fixtures.
EOF
}

source_url_env=
target_url_env=
output_dir=
is_local_postgres_url() {
  local url=$1 authority hostport host
  [[ "$url" =~ ^postgres(ql)?:// ]] || return 1
  authority=${url#*://}
  authority=${authority%%/*}
  hostport=${authority##*@}
  if [[ "$hostport" == \[::1\] || "$hostport" == \[::1\]:* ]]; then return 0; fi
  host=${hostport%%:*}
  [[ "$host" == "localhost" || "$host" == "127.0.0.1" ]]
}
while (($#)); do
  case "$1" in
    --source-url-env) source_url_env=${2-}; shift 2 ;;
    --target-url-env) target_url_env=${2-}; shift 2 ;;
    --output-dir) output_dir=${2-}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Invalid argument. Run with --help for usage." >&2; exit 2 ;;
  esac
done
[[ -n "$source_url_env" && -n "$target_url_env" && -n "$output_dir" ]] || { usage >&2; exit 2; }
for name in "$source_url_env" "$target_url_env"; do
  [[ "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo "URL environment variable name is invalid." >&2; exit 2; }
  [[ -n "${!name-}" ]] || { echo "A URL environment variable is unset or empty." >&2; exit 2; }
  is_local_postgres_url "${!name}" || {
    echo "Disposable drill accepts only localhost, 127.0.0.1, or ::1 PostgreSQL URLs." >&2; exit 2;
  }
done
[[ "${!source_url_env}" != "${!target_url_env}" ]] || {
  echo "Source and target URLs must differ; refusing a potentially destructive drill." >&2; exit 2;
}
command -v psql >/dev/null 2>&1 || { echo "psql is required for fixture identity verification." >&2; exit 127; }
command -v node >/dev/null 2>&1 || { echo "Node.js is required to prepare PostgreSQL service files." >&2; exit 127; }

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source_service_file=$(mktemp "${TMPDIR:-/tmp}/pg-service.XXXXXX")
target_service_file=$(mktemp "${TMPDIR:-/tmp}/pg-service.XXXXXX")
chmod 600 "$source_service_file" "$target_service_file"
trap 'rm -f -- "$source_service_file" "$target_service_file"' EXIT
node "$script_dir/lib/write-pg-service.mjs" "$source_url_env" "$source_service_file" dr_source
node "$script_dir/lib/write-pg-service.mjs" "$target_url_env" "$target_service_file" dr_target
# Compare server and database identities before writing a backup. URL aliases
# such as localhost and 127.0.0.1 are therefore rejected when they resolve to
# the same local database. The URL values never appear in a child argv.
source_identity=$(env -u "$source_url_env" -u "$target_url_env" PGSERVICEFILE="$source_service_file" PGSERVICE=dr_source \
  psql --no-psqlrc --set=ON_ERROR_STOP=1 --quiet --tuples-only \
  --command="SELECT current_database() || '|' || coalesce(inet_server_addr()::text, 'local') || '|' || inet_server_port()" \
  2>/dev/null | tr -d '[:space:]') || { echo "Could not identify local source fixture." >&2; exit 1; }
target_identity=$(env -u "$source_url_env" -u "$target_url_env" PGSERVICEFILE="$target_service_file" PGSERVICE=dr_target \
  psql --no-psqlrc --set=ON_ERROR_STOP=1 --quiet --tuples-only \
  --command="SELECT current_database() || '|' || coalesce(inet_server_addr()::text, 'local') || '|' || inet_server_port()" \
  2>/dev/null | tr -d '[:space:]') || { echo "Could not identify local target fixture." >&2; exit 1; }
[[ "$source_identity" != "$target_identity" ]] || {
  echo "Source and target identify as the same database; refusing destructive drill." >&2; exit 2;
}
env -u "$target_url_env" bash "$script_dir/pg-backup.sh" --database-url-env "$source_url_env" --output-dir "$output_dir"
archive=$(find "$output_dir" -maxdepth 1 -type f -name '*.dump' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)
[[ -n "$archive" && -f "$archive" ]] || { echo "Backup archive was not created." >&2; exit 1; }
manifest="${archive%.dump}.manifest"
[[ -f "$manifest" ]] || { echo "Backup manifest was not created." >&2; exit 1; }
env -u "$source_url_env" bash "$script_dir/pg-restore-verify.sh" --backup "$archive" --manifest "$manifest" \
  --target-url-env "$target_url_env" --confirm-destructive-restore RESTORE_INTO_ISOLATED_TARGET
printf 'Disposable local backup-to-restore drill completed.\n'