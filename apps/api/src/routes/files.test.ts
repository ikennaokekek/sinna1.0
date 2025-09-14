import { describe, it, expect } from 'vitest';
import { getSignedPutUrl, getSignedGetUrl } from '../lib/r2';

const SKIP = !process.env.R2_ACCOUNT_ID || !process.env.R2_BUCKET || !process.env.R2_ACCESS_KEY_ID;

describe('R2 signed URLs (integration)', () => {
  if (SKIP) {
    it.skip('integration test skipped (R2 env not set)', () => {});
  } else {
    it('can upload and download a dummy file via signed URLs', async () => {
      const key = `tests/${Date.now()}-dummy.txt`;
      const contentType = 'text/plain';
      const body = Buffer.from('hello sinna');

      const putUrl = await getSignedPutUrl(key, contentType, 300);
      const putRes = await fetch(putUrl, { method: 'PUT', headers: { 'content-type': contentType }, body });
      expect(putRes.ok).toBe(true);

      const getUrl = await getSignedGetUrl(key, 300);
      const getRes = await fetch(getUrl);
      expect(getRes.ok).toBe(true);
      const text = await getRes.text();
      expect(text).toBe('hello sinna');
    }, 20000);
  }
});


