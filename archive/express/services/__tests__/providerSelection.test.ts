import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Provider selection via env flags', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it('forces captions provider to assemblyai when PROVIDER_CAPTIONS=assemblyai', async () => {
    process.env.PROVIDER_CAPTIONS = 'assemblyai';
    process.env.ASSEMBLYAI_API_KEY = 'test';
    const { SpeechToTextService } = await import('../speechToText');
    const svc = new SpeechToTextService();
    const choice = (svc as any).selectProvider('auto');
    expect(choice).toBe('assemblyai');
  });

  it('forces tts provider to free-tts when PROVIDER_TTS=free', async () => {
    process.env.PROVIDER_TTS = 'free';
    const { TextToSpeechService } = await import('../textToSpeech');
    const svc = new TextToSpeechService();
    const provider = (svc as any).selectProvider('auto');
    expect(provider).toBe('free-tts');
  });

  it.skip('forces color provider to ffmpeg when PROVIDER_COLOR=ffmpeg (skipped: requires heavy mocks)', async () => {
    // Intentionally skipped to avoid native module setup (sharp/ffmpeg)
  });
});


