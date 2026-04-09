import { test, expect, request } from '@playwright/test';

const API_BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4000';
const API_KEY = process.env.API_KEY;

test('health is ok', async () => {
  test.skip(!API_KEY, 'Set API_KEY for Playwright health E2E');
  const api = await request.newContext({ baseURL: API_BASE });
  const res = await api.get('/health', {
    headers: { 'x-api-key': API_KEY! },
  });
  expect(res.status()).toBe(200);
});


