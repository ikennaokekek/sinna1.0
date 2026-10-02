# EIC-1 real-media validation preparation

The investor MVP smoke runner is **not a production test**. Do not start it on the
workspace's default database or the configured staging/live Redis service. This
repository currently has **no attested non-production R2 destination** and no
real-provider golden run is authorized by this document.

Before each run, an operator must independently verify a fresh disposable
local PostgreSQL database, local Redis, a queue prefix used by both the API and
worker for this run only, an R2 bucket demonstrably not used by production, and
the persistent workspace archive at `evidence/eic`. Create one fresh UUID for
`MVP_RUN_ID`; set `QUEUE_PREFIX` to `sinna:eic:<that UUID>` for the API, worker
and runner. Set `MVP_BASE_URL` explicitly to the local API. The runner refuses
non-loopback database, Redis and API URLs. Do not reuse an ID or archive path.
Create `evidence/eic` as a real workspace directory first; the runner verifies
its real path and write/read-back access before contacting external resources.
**An attestation is a record of an actual resource check, not a substitute for it.**

Supply `MVP_ISOLATION_MANIFEST` as the path to a JSON file shaped like:

```json
{
  "runId": "<fresh UUID>",
  "verifiedAt": "<current UTC ISO 8601 timestamp>",
  "database": {
    "kind": "disposable-local",
    "name": "<fresh local database name>",
    "verification": "<how separation and permission to delete only run data were confirmed>"
  },
  "queue": {
    "kind": "disposable-local",
    "prefix": "sinna:eic:<same UUID>",
    "verification": "<how local Redis and exclusive API/worker namespace were confirmed>"
  },
  "storage": {
    "bucket": "<configured non-production R2_BUCKET>",
    "nonProductionOwnershipVerified": true,
    "verification": "<who checked that the bucket is separate from production and how>"
  },
  "evidence": {
    "directory": "<absolute workspace path>/evidence/eic",
    "durableDestinationVerified": true,
    "verification": "<how archive persistence and retrieval were confirmed>"
  }
}
```

No passwords, tokens, URLs containing credentials, or signed URLs belong in the
attestation. The runner also requires a **clean committed revision**, configured
provider credentials, and FFmpeg/FFprobe. It does not provision any resources.
Ensure the API and worker actually use the attested test configuration before
starting them; the runner cannot inspect another process's environment.

For permissioned representative media, set `MVP_INPUT_MANIFEST` to a JSON file
with `path` (a local workspace media file), `sha256` (of its exact bytes), and
`permissionEvidence` (a non-secret explanation of use rights). Otherwise the
runner generates a synthetic preset-specific fixture. For proprietary media,
keep the manifest and input in the ignored `evidence/eic` directory rather than
committing them; their byte hashes are recorded alongside the exact committed
code revision. Do not put personal details in the manifest; the archive records
only its hash.

For each preset (`deaf`, `epilepsy_flash`, `epilepsy_noise`) run separately with
a fresh ID and attestation. The runner provisions two real test tenants, checks
both directions of artifact access and the other tenant's job lookup, downloads
the required outputs, records hashes and measurements, then copies the input
and outputs to `evidence/eic/<runId>`. It reads the copy back and verifies hashes
**before** removing run-owned queue entries, object keys, tenants or local media.
It never sweeps earlier runs. Failed archiving retains temporary and remote
state for manual recovery; the recovery manifest is in the reported temp folder.
Cleanup failures are recorded separately from technical failures.

The archive contains copyrighted/permissioned media and must not be committed
or published. A successful engineering run is not independent TRL-5, clinical,
epilepsy-safety, or accessibility certification. All three real-pipeline golden
presets remain **NOT TESTED** until actual run evidence and independent review.

See **`docs/EIC_PROTOCOL.md`** for the versioned expected-output contract,
runtime identity proof, private dataset/ownership templates and reviewer
checklist. Disabled AD is now explicitly excluded from real-output claims:
its degraded marker remains visible, retained and **not validated**, never a
passed AD check. Captions, color and transformed media remain strictly required.
All expert and representative-environment qualification gates remain open.