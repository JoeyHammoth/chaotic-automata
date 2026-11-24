import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseMacrocell, writeMacrocell } from '../lib/macrocell';
import { parseRle, population } from '../lib/rle';

function read(name: string): string {
  return readFileSync(new URL(`../../../public/fixtures/${name}`, import.meta.url), 'utf8');
}

function differences(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return Math.abs(a.length - b.length);
  let count = 0;
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) count += 1;
  }
  return count;
}

describe('the macrocell writer', () => {
  it('writes the header the reader expects', () => {
    const block = parseRle('x = 2, y = 2, rule = B3/S23\n2o$2o!');
    const text = writeMacrocell(block, 7);
    expect(text.startsWith('[M2] (golly 2.0)\n')).toBe(true);
    expect(text).toContain('#R B3/S23');
    expect(text).toContain('#G 7');
  });

  it('round-trips a small pattern, including the generation', () => {
    const block = parseRle('x = 2, y = 2, rule = B3/S23\n2o$2o!');
    const back = parseMacrocell(writeMacrocell(block, 7));
    expect([back.width, back.height]).toEqual([2, 2]);
    expect(population(back)).toBe(4);
    expect(back.generation).toBe(7);
  });

  it("round-trips Riley's breeder cell for cell", () => {
    const breeder = parseRle(read('rileysbreeder.rle'));
    const back = parseMacrocell(writeMacrocell(breeder));
    expect([back.width, back.height]).toEqual([135, 41]);
    expect(population(back)).toBe(38);
    expect(differences(back.cells, breeder.cells)).toBe(0);
  });

  it(
    'round-trips the whole 2058-square metapixel cell for cell',
    { timeout: 180_000 },
    () => {
      const metapixel = parseRle(read('otcametapixel.rle'));
      const text = writeMacrocell(metapixel);
      // A 2058-square pattern pads to level 12, so the root is 4096 cells on an edge.
      expect(text).toContain('\n12 ');
      const back = parseMacrocell(text);
      expect([back.width, back.height]).toEqual([2058, 2058]);
      expect(population(back)).toBe(64_691);
      expect(differences(back.cells, metapixel.cells)).toBe(0);
    },
  );

  it('refuses a pattern with nothing in it', () => {
    const empty = { width: 4, height: 4, cells: new Uint8Array(16), rule: null, format: 'rle' as const, generation: null };
    expect(() => writeMacrocell(empty)).toThrow(/at least one live cell/);
  });
});
