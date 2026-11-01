/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 },
  // Unit tests only. Live multiplayer tests run from vitest.live.config.ts.
  test: { include: ['tests/**/*.test.ts'] },
  build: {
    target: 'es2022',
    sourcemap: false,
    // Phaser alone is about 1.3 MB minified. This limit is raised so real overruns still show up.
    chunkSizeWarningLimit: 1600,
  },
});
