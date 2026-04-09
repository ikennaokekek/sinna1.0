import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function resolvePresetsJson(): string {
  const fromRepoRoot = join(process.cwd(), 'config', 'presets.json');
  if (existsSync(fromRepoRoot)) return fromRepoRoot;
  return join(process.cwd(), '..', '..', 'config', 'presets.json');
}

describe('Worker / shared preset config', () => {
  it('loads config/presets.json and exposes videoTransform presets', () => {
    const presetsPath = resolvePresetsJson();
    const presets = JSON.parse(readFileSync(presetsPath, 'utf-8')) as Record<
      string,
      { videoTransform?: boolean; videoTransformConfig?: Record<string, unknown> }
    >;

    for (const id of [
      'blindness',
      'deaf',
      'color_blindness',
      'epilepsy_flash',
      'epilepsy_noise',
      'cognitive_load',
      'adhd',
      'autism',
    ]) {
      expect(presets[id]?.videoTransform, id).toBe(true);
      expect(presets[id]?.videoTransformConfig, id).toBeTruthy();
    }

    expect(presets.everyday?.videoTransform).toBeUndefined();
  });
});
