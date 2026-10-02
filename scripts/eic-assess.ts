#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { blockedPresetResults, EIC_PROTOCOL, protocolSha256 } from './lib/eicProtocol';
import { sha256 } from './lib/eicValidation';
async function main() {
  const at = new Date().toISOString();
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const changes = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { encoding: 'utf8' });
  const blockers = ['Independent non-production R2 ownership and access evidence not supplied',
    'Licensed representative streaming dataset and rights proof not supplied',
    'Expert caption quality thresholds/overlay review and independent reviewer approval not supplied',
    'Legal applicant/eligibility evidence not found; gate open'];
  const receiptFile = process.argv[2];
  let runtimeEvidence: unknown = 'NOT_SUPPLIED';
  if (receiptFile) {
    const bytes = await fs.readFile(receiptFile);
    const receipt = JSON.parse(bytes.toString());
    runtimeEvidence = { sha256: sha256(bytes), revision: receipt.revision, mode: receipt.mode,
      verifiedAt: receipt.verifiedAt || null, checks: receipt.checks, stoppedAt: receipt.stoppedAt || null };
  }
  const result = { assessedAt: at, revision, changesSha256: sha256(changes + execFileSync('git', ['diff', 'HEAD'], { encoding: 'utf8' })),
    cleanRevision: !changes.trim(), protocol: EIC_PROTOCOL.version, protocolSha256,
    eic1: 'OPEN', trl5: 'NOT_ESTABLISHED', runtimeEvidence,
    presets: blockedPresetResults(blockers, at), independentValidationDocuments: 'NOT_FOUND', legalEvidence: 'NOT_FOUND' };
  const dir = path.join(process.cwd(), 'evidence/eic');
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  if (await fs.realpath(dir) !== dir) throw new Error('symlinked evidence destination refused');
  const file = path.join(dir, `assessment-${crypto.randomUUID()}.json`);
  await fs.writeFile(file, JSON.stringify(result, null, 2), { mode: 0o600 });
  if (sha256(await fs.readFile(file)) !== sha256(JSON.stringify(result, null, 2))) throw new Error('assessment read-back failed');
  console.log(JSON.stringify({ file, assessedAt: at, revision, eic1: result.eic1, presets: result.presets }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });