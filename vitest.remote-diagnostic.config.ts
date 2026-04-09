import { defineConfig } from 'vitest/config';

/** Production/staging smoke — set SINNA_API_URL, TEST_API_KEY, etc. */
export default defineConfig({
  test: {
    include: ['tests/fullIntegration.test.ts'],
    exclude: ['**/node_modules/**'],
    environment: 'node',
    testTimeout: 120000,
  },
});
