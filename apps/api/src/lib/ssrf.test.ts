import { describe, expect, it } from 'vitest';
import {
  UnsafeUrlError,
  isBlockedAddress,
  parseExternalHttpUrl,
  validateExternalHttpUrl,
} from './ssrf';

describe('outbound URL validation', () => {
  it('only accepts HTTP(S) URLs without credentials', () => {
    expect(parseExternalHttpUrl('https://media.example/video.mp4').hostname).toBe('media.example');
    expect(() => parseExternalHttpUrl('file:///etc/passwd')).toThrow(UnsafeUrlError);
    expect(() => parseExternalHttpUrl('https://user:pass@media.example/video.mp4')).toThrow(UnsafeUrlError);
  });

  it('rejects mapped IPv6 and other special-use addresses', () => {
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedAddress('::ffff:192.168.1.1')).toBe(true);
    expect(isBlockedAddress('fe80::1')).toBe(true);
    expect(isBlockedAddress('127.0.0.1')).toBe(true);
    expect(isBlockedAddress('8.8.8.8')).toBe(false);
  });

  it('rejects an IPv6 literal before any outbound request', async () => {
    await expect(validateExternalHttpUrl('http://[::ffff:127.0.0.1]/', async () => [
      { address: '::ffff:127.0.0.1' },
    ])).rejects.toThrow(UnsafeUrlError);
  });

  it('rejects a redirect target when it resolves privately', async () => {
    await expect(validateExternalHttpUrl('https://redirect.example/next', async () => [
      { address: '127.0.0.1' },
    ])).rejects.toThrow(UnsafeUrlError);
  });

  it('validates every DNS answer to prevent rebinding through mixed records', async () => {
    await expect(validateExternalHttpUrl('https://rebind.example/video.mp4', async () => [
      { address: '93.184.216.34' },
      { address: '10.0.0.7' },
    ])).rejects.toThrow(UnsafeUrlError);
  });
});