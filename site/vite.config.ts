import { defineConfig } from 'vitest/config';

// GitHub Pages serves a project site under a sub-path, so the base is a build-time constant.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      // Five pages, all static entry points: the atlas map, the Inspector panel, the Stress Lab, the
      // Verifier and the HashLife zoom. A page missing from this list is not built at all — it 404s
      // on Pages while the dev server happily serves it, so the list has to be kept in step with
      // the HTML at the root of `site/`.
      input: {
        main: 'index.html',
        inspector: 'inspector.html',
        stress: 'stress.html',
        verifier: 'verifier.html',
        hashlife: 'hashlife.html',
      },
    },
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
