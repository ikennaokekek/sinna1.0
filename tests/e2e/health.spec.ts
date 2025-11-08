import { test, expect, request } from '@playwright/test';

test('health is ok', async () => {
  const api = await request.newContext({ baseURL: process.env.E2E_BASE_URL });
  const res = await api.get('/health', {
    headers: { 'x-api-key': process.env.API_KEY! },
  });
  expect(res.status()).toBe(200);
});


