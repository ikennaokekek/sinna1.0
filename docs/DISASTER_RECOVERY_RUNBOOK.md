# PostgreSQL and Object-Storage Disaster Recovery Runbook

This is a provider-neutral procedure for logical PostgreSQL backups and
R2/S3-compatible backup storage. It does not replace an incident commander,
provider snapshots, or legal retention requirements. Keep URLs and credentials
in the approved secret manager; do not put them in tickets, chat, shell history,
manifests, or source control.

## Objectives, ownership, and cadence

| Item | Starting target (confirm with the business) | Owner |
| --- | --- | --- |
| RPO | ≤24 hours from daily logical backups; reduce with provider PITR/WAL archiving if required | Database owner |
| RTO | ≤4 hours for a clean-clone restore drill | Incident commander + application owner |
| Backup retention | Daily 35 days, monthly 12 months, yearly 7 years, subject to legal hold | Security/data owner |
| Restore drill | Quarterly and after a material schema or provider change | DR coordinator |

The database owner performs backups and validates completion. The storage owner
maintains immutability, replication, lifecycle, and access controls. The
application owner verifies application behavior and the migration ledger. The
incident commander authorizes production recovery and records actual RPO/RTO.
Review these targets, contacts, and retention rules at least annually.

## Safe logical backup

Install a PostgreSQL client version compatible with the server. On a protected
backup worker with an encrypted volume:

```bash
bash scripts/pg-backup.sh --database-url-env APPROVED_SOURCE_URL --output-dir /secure/backups/postgres
bash scripts/pg-backup-inventory.sh --backup-dir /secure/backups/postgres
```

The URL variable name is intentionally mandatory; the scripts do not fall back
to `DATABASE_URL`, accept URLs as arguments, or echo URLs. Set the named
variable through a protected ephemeral secret-injection mechanism, use
`umask 077`, and create custom-format archives plus a SHA-256 manifest. Upload only after
checking the archive and manifest exist. Preserve them together, retain the
local copy until remote inventory confirms receipt, and record backup time,
archive checksum, tool version, and operator in the change record.

Use provider-native snapshots/PITR in addition to—not instead of—logical
backups when the RPO needs are shorter than the backup schedule. Encrypt backup
worker disks and archives with organization-managed encryption where required;
protect encryption-key recovery material separately and test access to it.

## R2/S3-compatible object storage

Use a dedicated backup bucket/prefix and a least-privilege backup writer that
can write objects but cannot delete prior versions. Enable bucket versioning.
Enable object lock/WORM retention and legal holds where the provider supports
them; verify governance versus compliance mode, retention period, and break
glass authorization before relying on either. Configure server-side encryption
(provider-managed or customer-managed keys according to policy), TLS-only
access, audit/data-event logs, and separate backup-reader and restore roles.

Replicate to a separate account and, where feasible, a different provider or
region. Replication credentials and encryption keys must not share the source
account's administrative blast radius. Test that replicas include versions,
retention metadata, and manifests. Configure inventory reports and lifecycle
rules to transition older versions to archival tiers without deleting data
before the approved retention period or object-lock expiry.

Provider CLI configuration differs, so this repository intentionally does not
automate uploads. With an already configured credential profile, upload the
archive, manifest, and `SHA256SUMS` together; use the provider's checksum
option/metadata and then list or inventory the destination to compare object
names, sizes, versions, and SHA-256 values. Record the object version IDs.
Never place access keys or endpoint secrets in commands, scripts, or manifests.

## Verify backup integrity

1. Compare the manifest SHA-256 with a freshly computed local checksum and with
   the object-store checksum/inventory after upload.
2. Run `bash scripts/pg-backup-inventory.sh --backup-dir /secure/backups/postgres`
   periodically and reconcile its output with remote inventory, including
   version IDs and retention status.
3. Treat a missing manifest, checksum mismatch, inaccessible encryption key, or
   missing replicated version as a failed backup and escalate promptly.
4. Verify a representative backup by restoring it into a disposable isolated
   database at least quarterly; checksum validity alone is insufficient.

## Isolated restore drill

Never restore over a production database. Create a fresh, isolated target
database and restricted credentials outside the production network path. Fetch
the selected archive and manifest to an encrypted drill workspace, verify the
object version/checksum, then run:

```bash
bash scripts/pg-restore-verify.sh \
  --backup /secure/drill/postgres-YYYYMMDDTHHMMSSZ.dump \
  --manifest /secure/drill/postgres-YYYYMMDDTHHMMSSZ.manifest \
  --target-url-env ISOLATED_DRILL_URL \
  --confirm-destructive-restore RESTORE_INTO_ISOLATED_TARGET
```

The exact confirmation is required because restore writes objects into its
target. The script accepts only local targets and refuses a target with
non-extension user objects; it does not use `--clean` and is not a production
cutover tool. On failure, discard the target as potentially partial. Do not
connect the restored clone to production workers, webhooks, payment processors,
email, or external services. Use scrubbed/non-production outbound configuration
and block egress when feasible.

Before destructive action, the restore script validates the archive listing.
Afterward it verifies connectivity and, when
`public.sinna_core_schema_migrations` exists, verifies that the ledger is
queryable. It reports an absent ledger without failing, allowing generic
PostgreSQL backups to restore successfully. Run the application's migration
ledger **verify** command against the isolated URL when this application ledger
is expected. It must report no checksum drift, no gaps, correct
dispositions, and the expected pending/applied migrations. Also compare row
counts and critical schema objects to the backup-era expectations, start only
isolated validation services, execute read-only smoke checks, and document
restore duration, data timestamp, failures, and remediation.

For a fully automated **local disposable-fixture** drill (no provisioning,
object storage, or external resources), set two named environment variables to
local source and isolated target URLs, then run:

```bash
bash scripts/pg-disposable-drill.sh --source-url-env LOCAL_SOURCE_URL \
  --target-url-env LOCAL_TARGET_URL --output-dir /secure/local-drill
```

The script accepts only `localhost`, `127.0.0.1`, or `::1` PostgreSQL URLs,
then checks the database/server address/port identity before backup to reject
same-database aliases. The operator remains responsible for using only
disposable local source and target fixtures.

## Clean-clone recovery during an incident

1. Incident commander declares the incident, freezes destructive production
   changes, selects a recovery point, and confirms the estimated RPO.
2. Build a new clean database instance/account/project with patched PostgreSQL,
   private networking, encryption, monitoring, and separate credentials. Do
   not reuse a compromised host or credentials.
3. Retrieve a specific immutable backup object version plus manifest from the
   independent replica. Verify checksums before restore.
4. Restore and validate in a temporary isolated clone using the procedure
   above, including migration-ledger verification.
5. Restore the validated archive into the newly approved recovery target only
   under written incident authorization. Rotate database, storage, application,
   and integration credentials; review roles, extensions, scheduled jobs, and
   network rules before cutover.
6. Point services to the recovery target through the normal controlled change
   process. Monitor correctness, queues, writes, and security events. Preserve
   the old environment for forensics; do not destroy it until authorized.
7. Record actual RPO/RTO, archive incident evidence, repair backup gaps, and
   schedule a post-incident review.

## Drill evidence and review

For every drill retain the chosen backup object version, checksum results,
ledger result, restore start/end times, validation checklist, participants,
exceptions, and follow-up owner/date. Test both primary and replica recovery
paths, object-lock recovery access, decryption/key access, and clean-clone
cutover assumptions. A drill that only downloads an archive is not a restore
drill.