import { describe, expect, it, vi } from 'vitest';
import { resolveAudioDescriptionText } from './audioDescription';

function client(create: ReturnType<typeof vi.fn>) {
  return { chat: { completions: { create } } };
}

describe('resolveAudioDescriptionText', () => {
  it('propagates provider failures so BullMQ can retry the job', async () => {
    const failure = new Error('provider unavailable');
    await expect(resolveAudioDescriptionText(
      client(vi.fn().mockRejectedValue(failure)),
      undefined,
      'https://media.example/video.mp4',
    )).rejects.toBe(failure);
  });

  it('rejects empty provider output instead of producing fallback success text', async () => {
    await expect(resolveAudioDescriptionText(
      client(vi.fn().mockResolvedValue({ choices: [{ message: { content: '' } }] })),
      undefined,
      'https://media.example/video.mp4',
    )).rejects.toThrow('OpenAI chat returned no audio description text');
  });
});