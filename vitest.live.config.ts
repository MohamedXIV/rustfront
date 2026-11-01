// Runs the live multiplayer tests against a local SpacetimeDB server. Kept separate from `npm test`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['live/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
