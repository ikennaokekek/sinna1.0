import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { UnsafeUrlError, createPinnedLookup, createSsrfSafeFetcher } from './ssrf';

describe('worker SSRF-safe fetcher', () => {
  it('returns the pinned address shape requested by Node networking', () => {
    const lookup = createPinnedLookup({ address: '8.8.8.8', family: 4 });
    const callback = vi.fn();

    lookup('media.example', { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: '8.8.8.8', family: 4 }]);

    callback.mockClear();
    lookup('media.example', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
  });

  it('revalidates redirect destinations before connecting', async () => {
    const lookup = vi.fn(async (hostname: string) => {
      if (hostname === 'public.example') return [{ address: '8.8.8.8' }];
      return [{ address: '127.0.0.1' }];
    });
    const request = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'http://internal.example/metadata' },
    }));
    const fetcher = createSsrfSafeFetcher({ lookup, request });

    await expect(fetcher.fetch('https://public.example/video')).rejects.toThrow(UnsafeUrlError);
    expect(lookup).toHaveBeenCalledWith('public.example');
    expect(lookup).toHaveBeenCalledWith('internal.example');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('uses the approved DNS answer as the pinned connection target', async () => {
    const lookup = vi.fn(async () => [{ address: '8.8.4.4' }]);
    const request = vi.fn(async () => new Response('video', { status: 200 }));
    const fetcher = createSsrfSafeFetcher({ lookup, request });

    const response = await fetcher.fetch('https://media.example/file.mp4');

    expect(await response.text()).toBe('video');
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: 'media.example' }),
      { address: '8.8.4.4', family: 4 },
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('rejects a hostname when any DNS answer is private', async () => {
    const lookup = vi.fn(async () => [{ address: '8.8.8.8' }, { address: '::ffff:127.0.0.1' }]);
    const request = vi.fn();
    const fetcher = createSsrfSafeFetcher({ lookup, request });

    await expect(fetcher.fetch('https://mixed.example/file')).rejects.toThrow('disallowed address');
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects canonical and dotted IPv4-mapped IPv6 answers', async () => {
    for (const address of ['::ffff:127.0.0.1', '0:0:0:0:0:ffff:7f00:1']) {
      const fetcher = createSsrfSafeFetcher({
        lookup: async () => [{ address }],
        request: vi.fn(),
      });
      await expect(fetcher.fetch('https://mapped.example/file')).rejects.toThrow('disallowed address');
    }
  });

  it('keeps user media URLs out of provider payloads', () => {
    const worker = readFileSync('src/videoTransformWorker.ts', 'utf8');
    const index = readFileSync('src/index.ts', 'utf8');

    // These checks guard the trust-boundary contract: external media is read
    // through the pinned fetcher before any provider request is constructed.
    expect(worker).toContain('downloadExternalMedia(videoUrl)');
    expect(worker).toContain("formData.append('file', `data:video/mp4;base64,${video.toString('base64')}`)");
    expect(worker).not.toContain("formData.append('file', videoUrl)");
    expect(index).toContain('const source = await downloadExternalMedia(audioUrl)');
    expect(index).toContain('audio_url: uploadedAudioUrl');
    expect(index).not.toContain('audio_url: audioUrl');
    expect(index).toContain('source = await downloadExternalMedia(videoUrl)');
    expect(index).not.toContain("uploadForm.append('file', videoUrl)");
    const fetcherSource = readFileSync('src/lib/ssrf.ts', 'utf8');
    expect(fetcherSource).toContain('const response = await safeExternalFetch(value)');
    expect(index).toContain('timeout: LOCAL_COLOR_ANALYSIS_TIMEOUT_MS');
    expect(index).toContain("killSignal: 'SIGKILL'");
  });
});