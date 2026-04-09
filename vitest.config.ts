import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/**/*.test.ts',
      'tests/**/*.test.ts',
      'tests/**/*.integration.test.ts',
      'apps/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      'tests/e2e/**',
      // Run via: pnpm -C apps/worker test
      'apps/worker/**/*.test.ts',
      // Opt-in: pnpm test:heal (needs live API + TEST_API_KEY)
      'tests/**/*.heal.ts',
      // Opt-in: RUN_REMOTE_DIAGNOSTIC=1 pnpm exec vitest run tests/fullIntegration.test.ts
      'tests/fullIntegration.test.ts',
    ],
    environment: 'node',
    testTimeout: 120000,
  },
});


