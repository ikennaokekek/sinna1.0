import { defineConfig } from 'vitest/config';

/** Live API + TEST_API_KEY — not part of default CI. */
export default defineConfig({
  test: {
    include: ['tests/videoTransform.heal.ts'],
    exclude: ['**/node_modules/**'],
    environment: 'node',
    testTimeout: 120000,
  },
});
