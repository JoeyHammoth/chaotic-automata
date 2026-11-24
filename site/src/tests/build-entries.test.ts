import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import config from '../../vite.config';

// The dev server serves any .html file it finds, but `vite build` only emits the pages named in its
// Rollup input. A page missing from that list works locally and 404s on Pages — which is exactly
// what happened to verifier.html and hashlife.html, and why the accessibility job was scoring a 404
// body for two of its five pages. This test makes that mismatch impossible to merge.
describe('the site build', () => {
  it('names every page at the root of site/ as a build input', () => {
    const pages = readdirSync(new URL('../../', import.meta.url))
      .filter((name) => name.endsWith('.html'))
      .sort();
    const inputs = Object.values(
      (config.build?.rollupOptions?.input ?? {}) as Record<string, string>,
    ).sort();
    expect(pages.length).toBeGreaterThan(0);
    expect(inputs).toEqual(pages);
  });

  it('builds each page under the sub-path GitHub Pages serves it from', () => {
    expect(config.base).toBeDefined();
  });
});
