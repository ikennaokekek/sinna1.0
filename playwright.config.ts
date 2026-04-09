import { defineConfig } from '@playwright/test';

/**
 * Playwright runs only tests under tests/e2e.
 * Vitest must not load these files (see vitest.config.ts exclude).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: ['**/*.spec.ts'],
  timeout: 60000,
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:4000',
  },
});
