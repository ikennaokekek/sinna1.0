#!/usr/bin/env bash
# Restore only into an explicitly named isolated target after checksum validation.
set -euo pipefail
umask 077

usage() {
  cat <<'EOF'
Usage: pg-restore-verify.sh --backup FILE --target-url-env NAME \
  --confirm-destructive-restore RESTORE_INTO_ISOLATED_TARGET [--manifest FILE]

This drops objects in the target database. The target must be an isolated,
disposable restore-drill database. NAME is an already-set environment variable;
the URL is never accepted on the command line or printed.
EOF
}

backup=
target_url_env=
manifest=
confirmation=
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
    --backup) backup=${2-}; shift 2 ;;
    --target-url-env) target_url_env=${2-}; shift 2 ;;
    --manifest) manifest=${2-}; shift 2 ;;
    --confirm-destructive-restore) confirmation=${2-}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Invalid argument. Run with --help for usage." >&2; exit 2 ;;
  esac
done
[[ -n "$backup" && -n "$target_url_env" ]] || { usage >&2; exit 2; }
[[ "$target_url_env" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
  echo "Target URL environment variable name is invalid." >&2; exit 2;
}
target_url=${!target_url_env-}
[[ -n "$target_url" ]] || { echo "Target URL environment variable is unset or empty." >&2; exit 2; }
[[ "$target_url" != *$'\n'* && "$target_url" != *$'\r'* ]] || { echo "Target URL contains an unsupported newline." >&2; exit 2; }
is_local_postgres_url "$target_url" || { echo "Restore drills accept only localhost, 127.0.0.1, or ::1 target URLs." >&2; exit 2; }
[[ "$confirmation" == "RESTORE_INTO_ISOLATED_TARGET" ]] || {
  echo "Refusing destructive restore: supply the exact required confirmation." >&2; exit 2;
}
[[ -f "$backup" ]] || { echo "Backup file not found." >&2; exit 2; }
command -v pg_restore >/dev/null 2>&1 || { echo "pg_restore is required." >&2; exit 127; }
command -v psql >/dev/null 2>&1 || { echo "psql is required for post-restore verification." >&2; exit 127; }
command -v node >/dev/null 2>&1 || { echo "Node.js is required to prepare the PostgreSQL service file." >&2; exit 127; }

if [[ -n "$manifest" ]]; then
  [[ -f "$manifest" ]] || { echo "Manifest file not found." >&2; exit 2; }
  expected=$(awk -F= '$1 == "sha256" { print $2; exit }' "$manifest")
  [[ "$expected" =~ ^[0-9a-f]{64}$ ]] || { echo "Manifest has no valid SHA-256 checksum." >&2; exit 2; }
  if command -v sha256sum >/dev/null 2>&1; then actual=$(sha256sum -- "$backup" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then actual=$(shasum -a 256 -- "$backup" | awk '{print $1}')
  else echo "sha256sum or shasum is required for manifest verification." >&2; exit 127
  fi
  [[ "$actual" == "$expected" ]] || { echo "Checksum mismatch; refusing restore." >&2; exit 1; }
fi

error_log=$(mktemp "${TMPDIR:-/tmp}/pg-restore.XXXXXX")
service_file=$(mktemp "${TMPDIR:-/tmp}/pg-service.XXXXXX")
chmod 600 "$error_log"
chmod 600 "$service_file"
trap 'rm -f -- "$error_log" "$service_file"' EXIT
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
node "$script_dir/lib/write-pg-service.mjs" "$target_url_env" "$service_file" dr_restore
unset "$target_url_env"
unset target_url
# Parse the archive before any destructive action. Do not emit its contents:
# archive metadata can contain object names that do not belong in console logs.
if ! pg_restore --list "$backup" >/dev/null 2>"$error_log"; then
  echo "Archive listing failed; refusing restore." >&2
  exit 1
fi
empty_target=$(PGSERVICEFILE="$service_file" PGSERVICE=dr_restore psql --no-psqlrc --set=ON_ERROR_STOP=1 --quiet \
  --tuples-only --command="
    WITH objects AS (
      SELECT 'pg_class'::regclass AS classid, c.oid
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      UNION ALL
      SELECT 'pg_proc'::regclass, p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      UNION ALL
      SELECT 'pg_type'::regclass, t.oid FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      UNION ALL
      SELECT 'pg_namespace'::regclass, n.oid FROM pg_namespace n
      WHERE n.nspname NOT IN ('public', 'information_schema') AND n.nspname !~ '^pg_'
    )
    SELECT NOT EXISTS (
      SELECT 1 FROM objects o WHERE NOT EXISTS (
        SELECT 1 FROM pg_depend d JOIN pg_extension e ON e.oid = d.refobjid
        WHERE d.classid = o.classid AND d.objid = o.oid
          AND d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e'
      )
    )" 2>"$error_log" | tr -d '[:space:]') || {
  echo "Could not verify that the isolated target is empty." >&2; exit 1;
}
[[ "$empty_target" == "t" ]] || { echo "Refusing restore: target contains non-extension user objects." >&2; exit 2; }
if ! PGSERVICEFILE="$service_file" PGSERVICE=dr_restore pg_restore --dbname=service=dr_restore --no-owner --no-privileges \
  --exit-on-error "$backup" 2>"$error_log"; then
  echo "Restore failed. Target may be partial; discard the isolated target." >&2
  exit 1
fi
if ! PGSERVICEFILE="$service_file" PGSERVICE=dr_restore psql --no-psqlrc --set=ON_ERROR_STOP=1 --quiet \
  --tuples-only --command='SELECT 1' >/dev/null 2>"$error_log"; then
  echo "Restore completed, but post-restore connectivity verification failed." >&2
  exit 1
fi
ledger_present=$(PGSERVICEFILE="$service_file" PGSERVICE=dr_restore psql --no-psqlrc --set=ON_ERROR_STOP=1 --quiet \
  --tuples-only --command="SELECT to_regclass('public.sinna_core_schema_migrations') IS NOT NULL" \
  2>"$error_log" | tr -d '[:space:]') || {
  echo "Restore completed, but migration-ledger presence check failed." >&2; exit 1;
}
if [[ "$ledger_present" == "t" ]]; then
  ledger_rows=$(PGSERVICEFILE="$service_file" PGSERVICE=dr_restore psql --no-psqlrc --set=ON_ERROR_STOP=1 --quiet \
    --tuples-only --command='SELECT count(*) FROM public.sinna_core_schema_migrations' \
    2>"$error_log" | tr -d '[:space:]') || {
    echo "Restore completed, but migration ledger is not queryable." >&2; exit 1;
  }
  [[ "$ledger_rows" =~ ^[0-9]+$ ]] || { echo "Restore completed, but migration ledger result was invalid." >&2; exit 1; }
  printf 'Restore and post-restore checks completed; migration ledger is present (%s rows).\n' "$ledger_rows"
else
  printf 'Restore and connectivity checks completed; migration ledger is absent (valid for generic backups).\n'
fi