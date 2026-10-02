import { describe, it, expect } from 'vitest';
import { EIC_PROTOCOL, inspectCaptions, blockedPresetResults, protocolSha256 } from '../scripts/lib/eicProtocol';
import { requireRealArtifacts } from '../scripts/lib/eicValidation';

describe('versioned EIC protocol', () => {
  it('keeps three separate untested real results and pending independent review', () => {
    const results = blockedPresetResults(['non-production R2 not verified']);
    expect(results.map(r => r.preset)).toEqual(['deaf', 'epilepsy_flash', 'epilepsy_noise']);
    expect(results.every(r => r.realExecution === 'NOT_TESTED' && r.engineeringStatus === 'BLOCKED' && r.independentReview === 'PENDING')).toBe(true);
    expect(protocolSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(() => blockedPresetResults([])).toThrow();
  });
  it('does not count disabled AD markers as validated output or relax required steps', () => {
    const steps = Object.fromEntries(['captions', 'color', 'videoTransform'].map(name =>
      [name, { status: 'completed', degraded: false, artifactKey: `artifacts/a/${name}`, url: 'https://fixture/object' }]));
    steps.ad = { status: 'completed', degraded: true, artifactKey: 'artifacts/a/silent', url: 'https://fixture/marker' };
    expect(() => requireRealArtifacts(steps, 'a', EIC_PROTOCOL.requiredRealArtifacts)).not.toThrow();
    expect(EIC_PROTOCOL.disabledSteps.ad).toContain('never a passed');
    steps.color.degraded = true;
    expect(() => requireRealArtifacts(steps, 'a', EIC_PROTOCOL.requiredRealArtifacts)).toThrow();
  });
  it('records caption timing without inventing expert quality/overlay approval', () => {
    const inspection = inspectCaptions('WEBVTT\n\n00:00:00.500 --> 00:00:01.500\nHello.\n\n', 2);
    expect(inspection.cueCount).toBe(1);
    expect(inspection.contentQualityStatus).toBe('PENDING_EXPERT_AGREEMENT');
    expect(inspection.visibleOverlayStatus).toBe('PENDING_INDEPENDENT_INSPECTION');
  });
  it.each([
    'WEBVTT\n\n00:00:01.000 --> 00:00:00.500\nreversed\n',
    'WEBVTT\n\n00:00:00.500 --> 00:00:03.500\noutside\n',
    'WEBVTT\n\n00:00:00.500 --> 00:00:01.500\n\n',
    'WEBVTT\n\nstub without cues',
  ])('rejects invalid caption evidence %#', vtt => expect(() => inspectCaptions(vtt, 2)).toThrow());
});