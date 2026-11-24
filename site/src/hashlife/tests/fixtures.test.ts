import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseRle, population, tile, type Pattern } from '../lib/rle';

// The published pattern files, committed under site/public/fixtures so the page fetches exactly what
// the test parses. Both come from the LifeWiki pattern collection, mirrored on GitHub.
function read(name: string): string {
  return readFileSync(new URL(`../../../public/fixtures/${name}`, import.meta.url), 'utf8');
}

function quadrant(pattern: Pattern, qx: number, qy: number, side: number): number {
  let live = 0;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      live += pattern.cells[(qy * side + y) * pattern.width + qx * side + x] ?? 0;
    }
  }
  return live;
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

  it('tiles into a 2x2 array of four intact copies', () => {
    const metapixel = parseRle(read('otcametapixel.rle'));
    const array = tile(metapixel, 2, 2);
    expect([array.width, array.height]).toEqual([4116, 4116]);
    expect(population(array)).toBe(64_691 * 4);
    // Each quadrant is a complete copy, so the array is four metapixels and not a scaled one.
    for (const [qx, qy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      expect(quadrant(array, qx, qy, 2058)).toBe(64_691);
    }
  });

  it('refuses a tiling with no copies', () => {
    const metapixel = parseRle(read('otcametapixel.rle'));
    expect(() => tile(metapixel, 0, 2)).toThrow(/at least one copy/);
  });
});
