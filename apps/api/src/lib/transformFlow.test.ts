import { describe, expect, it, vi } from 'vitest';
import { createTransformFlow } from './transformFlow';

describe('createTransformFlow', () => {
  it('places prerequisite artifact IDs in parent data atomically with child job IDs', () => {
    const ids = ['caption-id', 'ad-id', 'color-id'];
    const createId = vi.fn(() => ids.shift()!);
    const flow = createTransformFlow({
      videoUrl: 'https://media.example/video.mp4',
      tenantId: 'tenant-1',
      presetId: 'blindness',
      transformConfig: { audioDescription: true },
      captionData: {},
      adData: {},
      colorData: {},
    }, createId);

    expect(flow.definition.data.captionJobId).toBe('caption-id');
    expect(flow.definition.data.adJobId).toBe('ad-id');
    expect(flow.definition.children.map((child) => child.opts.jobId)).toEqual([
      'caption-id',
      'ad-id',
      'color-id',
    ]);
    expect(flow.definition.children.every((child) => child.opts.failParentOnFailure)).toBe(true);
  });
});