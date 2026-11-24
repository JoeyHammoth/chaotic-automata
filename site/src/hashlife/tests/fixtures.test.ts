import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseRle, population, spread, type Pattern } from '../lib/rle';

// The published pattern files, committed under site/public/fixtures so the page fetches exactly what
// the test parses. Both come from the LifeWiki pattern collection, mirrored on GitHub.
function read(name: string): string {
  return readFileSync(new URL(`../../../public/fixtures/${name}`, import.meta.url), 'utf8');
}


describe("Riley's breeder", () => {
  it('imports as a 135x41 pattern of 38 live cells', () => {
    const pattern = parseRle(read('rileysbreeder.rle'));
    expect([pattern.width, pattern.height]).toEqual([135, 41]);
    expect(population(pattern)).toBe(38);
    expect(pattern.rule).toBe('B3/S23');
  });
});

describe('the OTCA metapixel', () => {
  it('imports as a 2058x2058 unit cell of 64,691 live cells', () => {
    const pattern = parseRle(read('otcametapixel.rle'));
    expect([pattern.width, pattern.height]).toEqual([2058, 2058]);
    expect(population(pattern)).toBe(64_691);
  });

  it('spreads into a 2x2 array of four intact copies, one per 4096-square', () => {
    const metapixel = parseRle(read('otcametapixel.rle'));
    const array = spread(metapixel, 2, 2);
    // 4096 + 2058: the copies are a power-of-two apart so the quadtree can share them.
    expect([array.width, array.height]).toEqual([6154, 6154]);
    expect(population(array)).toBe(64_691 * 4);
    for (const [x, y] of [
      [0, 0],
      [4096, 0],
      [0, 4096],
      [4096, 4096],
    ] as const) {
      let live = 0;
      for (let row = 0; row < 2058; row++) {
        for (let column = 0; column < 2058; column++) {
          live += array.cells[(y + row) * array.width + x + column] ?? 0;
        }
      }
      expect(live).toBe(64_691);
    }
  });

  it('refuses a tiling with no copies', () => {
    const metapixel = parseRle(read('otcametapixel.rle'));
    expect(() => spread(metapixel, 0, 2)).toThrow(/at least one copy/);
  });
});
