# EIC-1 evidence-based re-audit — 2026-10-02

**EIC-1 OPEN. TRL-5 NOT ESTABLISHED. No real-provider media jobs executed.**
Protocol: `SINNA-EIC-1/1.0.0`. See `EIC_PROTOCOL.md` for the acceptance matrix,
representative dataset plan, expert gates and independent-review checklist.

## Reconciliation and evidence scope

GitHub main was checked through the authorized GitHub connection and remains
`8ffcb72278fd0e9a270b7ec0387c807109f6ae7c`. PR #1's merge
`956b6fc916af10b42ace2b408b6437f0fe0d53ef` is in its history. CI
`36309766840` succeeded at the baseline, but its worker lifecycle is stubbed:
**not real-media or TRL-5 proof**. No open PR or active SINNA workflow was found
at the start. Newer local preparation commit
`3f9c66af9d61325b7af716a50b608e5b662bc1a1` and all preceding local history were
preserved. No staging or production deployment/promotion safeguards were weakened.

This re-audit distinguishes implementation tests, real local-resource checks,
real-provider integrated media, representative streaming qualification and
independent/legal approval. These are different evidence categories.

## Nine prerequisites

| # | Outcome | Evidence/status |
|---|---|---|
| 1 | Hardened fail-closed authorization | Live API/worker PID/start-time, revision, actual environment binding, compiled-byte hashes, local resource markers and independently supplied storage-document hashes required. Unknown owner blocks media, not repository work. |
| 2 | Own-run-only cleanup implemented and locally tested | No stale-demo sweep. No recursive child removal. Actual local BullMQ test rejects foreign tenant removal and preserves an older job, another queue namespace, DB sentinel and Redis sentinel. Unknown submission/upload/transaction outcome retains state. |
| 3 | Durable capture and recovery implemented/tested | Fsynced/read-back-verified private journals and archives, local recovery command, separate technical/cleanup errors, available failed/degraded output capture before cleanup. Helper tests cover interruption, source deletion, archive/update failure and recovery. Real-provider interruption/host-crash recovery not executed. |
| 4 | Separate preset outcomes/versioned protocol prepared | All three explicitly `NOT_TESTED` with `BLOCKED` execution assessments. Disabled AD marker remains excluded/not validated, not a passed check. |
| 5 | Native local isolation established; runtime verification recorded separately | Fresh local PG/Redis identities/readiness and independent-resource preservation tested. Exact-revision API/worker local-only receipts record actual startup/heartbeat/readiness, tool/build hashes and shutdown outcomes. No media work in these tests. |
| 6 | **BLOCKED externally** | No real non-production R2 ownership/access/separation documents supplied. Templates/fixture tests are not ownership proof. Local archive read-back is implemented; offsite backup, retention policy and private reviewer access require operator verification. |
| 7 | Prepared, approval pending | Protocol, unavailable dataset cases, engineering/expert acceptance matrix and independent/legal checklist committed. No licensed representative media, expert threshold agreement, reviewer approval or verified legal applicant documents supplied/found. |
| 8 | **BLOCKED; NOT TESTED** | No real integrated pipeline execution for deaf, epilepsy_flash or epilepsy_noise. No downloaded real-media output or qualifying streaming-environment inspection exists. |
| 9 | Re-audit produced; gate stays OPEN | This dated report and private machine-readable assessment keep implementation, blockers, exclusions and actual evidence separate. |

## Preset results

| Preset | Real execution | Representative streaming environment | Independent approval |
|---|---|---|---|
| deaf | NOT TESTED — BLOCKED | NOT ESTABLISHED | PENDING |
| epilepsy_flash | NOT TESTED — BLOCKED | NOT ESTABLISHED | PENDING |
| epilepsy_noise | NOT TESTED — BLOCKED | NOT ESTABLISHED | PENDING |

Deaf quality thresholds and visible-overlay inspection remain pending expert
agreement. Flash/noise improvements are engineering proxies, never medical or
safety certification. Synthetic media alone cannot establish relevance.

## Verification and stable private references

Actual checks: **23 focused offline tests**, **1 native local-resource test** and
**17 staging/promotion safeguard tests** passed, with no failures or skips in
these checks. Static TypeScript and diff checks passed. The native test creates
only its own local resources; it is opt-in rather than silently included in
ordinary CI unit tests.

The first complete local-only API/worker verification used exact revision
`8a8a1973790e8ef1acc83eddf128298bed408251`: actual API readiness, fresh
four-queue worker heartbeat, PID/start-time/resource binding and compiled-byte
hashes were verified. Both processes exited with code 0; zero media jobs were
submitted. The standard provider readiness remained deliberately
`BLOCKED_NOT_TESTED` because provider credentials were stripped. It was not
made green with dummy credentials. Subsequent report/source revisions are
identified in delivery and private receipts; no real-media test is implied.

On 2026-10-02, separate runner invocations for all three presets each exited
with a retained `blocked` preflight journal before resource access. The private
dated assessment records real execution as `NOT_TESTED`, not a pass.

Private references (ignored; do not push to this public repository):

- `evidence/eic-local/tests-*.json`: actual focused test reports.
- `evidence/eic-local/independent-runs-*.json`: native resource/cleanup assertions.
- `evidence/eic-local/<run UUID>/runtime-local-only*.json`: exact-revision runtime
  readiness, build hashes, zero submitted media jobs and shutdown result.
- `.local/eic-infra/<run UUID>/receipt.json`: resource identities, creation,
  readiness and stopped/retained state; PostgreSQL/Redis logs retained.
- `evidence/eic/attempt-<run UUID>/journal.json`: preflight blocked attempts or
  interrupted/failed media attempts. Existing real-media attempts: none.
- `evidence/eic/assessment-*.json`: dated machine-readable separate preset status.

Early local setup/supervisor failures were retained rather than silently
discarded; they are not validation passes. Private files contain actual UTC
times and hashes. A signed URL or a template is not an evidence reference.

## Minimal external decisions/evidence required

1. Owner-issued verification of a validation-only R2 account/bucket, exclusion
   from production use, appropriate access policy, and a private durable
   retention/reviewer-access policy (including provider retention).
2. Licensed representative streaming cases with rights for processing,
   derivative evidence retention and independent review; agreed real
   client/network/load coverage.
3. Independent expert/reviewer engagement, approved deaf quality criteria and
   dated review of actual future runs; verified legal applicant/eligibility
   documentation where required. No legal identity or approval is invented here.

Only after those gates are verified may isolated real-provider runs begin.