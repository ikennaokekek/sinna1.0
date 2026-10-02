# SINNA EIC-1 representative-environment protocol

Protocol **SINNA-EIC-1/1.0.0**, dated **2026-10-02**. Its machine-readable
definition and SHA-256 are in `scripts/lib/eicProtocol.ts`. Protocol changes
require a version change and reviewer agreement; previous results remain tied
to their original version. A 240,000 ms deadline starts before job submission.

## Authority and ordering

1. Preserve local history; compare exact GitHub main and open work. Green CI
   that uses stub queue workers is only a queue-lifecycle result.
2. Provision **new** native local PostgreSQL/Redis in a fresh UUID directory,
   never via the workspace's configured service URLs:
   `node scripts/eic-local-infra.mjs start-hold <UUID>`. In Replit keep this
   supervisor running as a background shell task. Readiness proves process
   ownership, database data-directory/name/comment marker (no user tables), Redis PID start-time and
   run marker over actual protocols. Setup failures retain logs and data.
3. Review a private ownership document for a validation-only R2 account/bucket,
   production usage exclusion and read/write/delete permission. Check the
   referenced evidence independently. A template is not an attestation.
4. Commit source, then `pnpm exec tsx scripts/eic-runtime.ts <UUID>` builds both
   runtimes from that clean revision, bootstraps only the owned database,
   verifies API/local worker heartbeat readiness and live process binding,
   and stops its children. This default is **local-only**, strips all provider
   credentials, disables dotenv loading, and submits no media. Full provider
   worker readiness is explicitly `BLOCKED_NOT_TESTED` in this local-only mode;
   it is not made green using dummy credentials.
5. Only after all external prerequisites are verified, `--real` may start a
   live attested runtime. Supply `MVP_ISOLATION_MANIFEST` and
   `MVP_STORAGE_OWNERSHIP_DOCUMENT` from ignored private evidence. The real
   runner must use the **same explicit local URLs**, queue prefix, run UUID,
   provider configuration and `MVP_RUNTIME_RECEIPT`. It refuses stale PIDs,
   wrong resources/revisions and changed compiled bytes. The receipt must be
   live; a local-only or stopped receipt cannot authorize media.
6. Use a fresh namespace/runtime/attestation for each preset. Supply private
   `MVP_INPUT_MANIFEST` with exact media SHA-256 and verifiable permission.
   Run `pnpm exec tsx scripts/investor-mvp-smoke.ts <preset>` only after these
   checks. The configured generic preview workflow is not an isolated launcher.
7. Independently review retained outputs, metrics, assertions and cleanup.

## Acceptance matrix

| Scope | Engineering requirement | Expert/qualification gate |
|---|---|---|
| All presets | All queued flow steps complete within 240 s; required real captions, color analysis and transformed media are completed, non-degraded, nonempty and owned by the authenticated tenant | Real representative conditions and independent sign-off required |
| Access | Both provisioned tenants retrieve own actual artifacts; both cross-tenant signing directions and other-tenant job lookup denied | No invented user acceptance |
| AD | These three presets disable AD. A completed degraded silent marker is retained/classified `NOT_APPLICABLE_DISABLED`, **not a passed AD validation** | Any future AD claim needs an AD-enabled protocol and real audio checks |
| deaf | Valid ordered cue times within media duration, nonempty text; retained VTT, original/output media and three overlay frames | Accuracy, latency, readability, synchronization tolerance, speaker/sound descriptions and visible overlay inspection **pending expert agreement**; no unapproved numeric quality threshold |
| epilepsy_flash | Maximum luminance delta and rapid high-delta transition counts both decrease | This is a **flash-risk engineering proxy**, not safety, medical or clinical certification |
| epilepsy_noise | Peak and RMS range decrease; both use 48 kHz, equal positive counts of matching 100 ms windows; finite encoded true peak at/below the recorded **−2 dBTP** ceiling; downloaded AAC/MP4 at 48 kHz; independent true peak agrees within **0.01 dB** | Proxy engineering evidence only; relevant environment and expert scope still required |

Disabled/skipped/non-required checks remain visible and are never relabeled
passed. Missing, blocked or degraded **required** artifacts fail the engineering
gate. An engineering pass does not close expert, representative-environment,
legal or independent-validation gates.

## Representative dataset and environment

Use `docs/eic-dataset.template.json` only as a planning template. The workspace
has **no verified licensed representative inputs**. Do not put media, real rights
documents, signed URLs, reviewer personal details or credentials in this public
repository. Populate the private dataset manifest and keep owner-issued rights
documents at stable private paths with hashes.

For each case record permission scope for processing, derived outputs, reviewer
access, retention and permitted sharing; duration, codecs, frame/sample rate,
resolution, language, speech/noise/flash characteristics, ground truth transcript
when authorized, HLS/DASH/original stream origin, segment/discontinuity/caption
offset behavior and the intended client/network/load conditions.

Required planned cases: licensed speech/dialogue for deaf; permissioned known
flash transitions for the engineering proxy; licensed dialogue with abrupt
audio peaks/dynamic ranges for noise. Include realistic encoding variants,
stream buffering/segment boundaries and intended users/assistive technology.
A local file uploaded to R2, even when licensed, is **not by itself proof of a
relevant streaming environment**. The runner's synthetic fixtures only test
engineering behavior. Unavailable cases remain `UNAVAILABLE_NOT_TESTED`.

## Evidence and recovery

Ignored `evidence/eic/` holds per-attempt fsynced journals (including blocked
preflight), complete read-back/hash-verified archives and local recovery copies.
`evidence/eic-local/` holds infrastructure/runtime tests and redacted logs.
Each attempt records UTC times, exact revision/change hash, protocol hash,
tool versions, redacted resource binding, input permissions and characteristics,
hashes/bytes, actual retained media/captions, numeric metrics, assertion and
step classifications, recovery identifiers and separate technical/cleanup
failures. Available failed/degraded outputs are captured too. Failed retrieval,
unknown job submission, archive failure or locked/unowned queue work retains
remote resources. Deletion never recursively removes queue children.
Local temporary media is retained for forensic recovery even after successful
remote cleanup; only an operator may remove that run-specific copy after
verifying the durable archive. The real runtime deliberately uses local FFmpeg
instead of inheriting Cloudinary/OpenAI configuration for these AD-disabled
presets; AssemblyAI caption processing still requires authorized provider access
and a reviewed provider-retention policy.

Signed URLs are retrieval tools, **not stable evidence references**. Cite private
archive paths, revision, protocol and SHA-256. Workspace read-back verifies local
retention, not offsite backup or retention policy. Before real execution an
operator must verify storage persistence, reviewer access and retention policy.

SIGINT/SIGTERM record interruption immediately and use bounded read-only final
output capture before archiving/cleanup. SIGKILL or host failure cannot execute
a finalizer: the last fsynced journal and recoverable state remain the recovery
source; do not claim a complete final bundle for such an interruption until
recovered and verified. `pnpm exec tsx scripts/eic-recover-evidence.ts <journal>`
copies local recorded media to a new hash-verified archive and performs **no
cleanup**. If source is missing, recovery fails visibly. Never sweep older runs.

## Independent reviewer checklist (all approvals presently pending)

- Confirm independence, expertise, conflict-of-interest declaration and agreed
  scope; identity documentation remains private.
- Verify actual revision, build hashes, protocol version, process/resource
  identities, R2 owner/separation/access proof and evidence-retention policy.
- Verify rights, dataset hashes, representative streaming/network/client/load
  coverage and original media provenance.
- Inspect actual input/output and captions; review deaf timing/content/overlay
  frames plus full video; agree quality thresholds **before** a qualifying run.
- Recalculate flash/noise metrics from retained bytes; distinguish proxy results
  from any clinical/safety claim. Review failed and excluded checks too.
- Verify tenant isolation and own-run cleanup outcomes, including untouched
  older resources and recoverability of failures.
- Record each preset's engineering, representative, expert and independent
  status separately; sign a dated assessment with stable private evidence refs.
- Verify legal applicant, ownership/eligibility, relevant regulatory and data
  rights documents independently. None was found in the inspected workspace.
  Do not invent applicant facts or approvals.