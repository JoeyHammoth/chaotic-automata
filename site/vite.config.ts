import { defineConfig } from 'vitest/config';

// GitHub Pages serves a project site under a sub-path, so the base is a build-time constant.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  test: {
    // Playwright owns e2e/; vitest owns the unit tests next to the code.
    include: ['src/**/*.test.ts'],
  },
});
