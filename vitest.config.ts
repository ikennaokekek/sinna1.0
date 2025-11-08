import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'tests/**/*.spec.ts', 'tests/**/*.heal.ts'],
    environment: 'node',
    testTimeout: 120000, // 2 minutes for auto-heal tests
  },
});


