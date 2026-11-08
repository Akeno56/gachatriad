import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'packages/**/*.test.ts',
      'tools/**/*.test.mjs',
      'apps/server/**/*.test.ts',
      'apps/web/lib/**/*.test.ts',
    ],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
