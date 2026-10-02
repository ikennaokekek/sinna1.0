import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['tests/eicLocalInfra.test.ts'], environment: 'node', maxWorkers: 1, testTimeout: 60_000 },
});