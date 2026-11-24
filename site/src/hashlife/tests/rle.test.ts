import { describe, expect, it } from 'vitest';

import { liveCells, parseRle, PatternError, population } from '../lib/rle';

const GUN = `#N Gosper glider gun
x = 36, y = 9, rule = B3/S23
24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!`;

describe('RLE import', () => {
  it('reads the Gosper gun with its declared size, rule and population', () => {
    const gun = parseRle(GUN);
    expect(gun.width).toBe(36);
    expect(gun.height).toBe(9);
    expect(gun.rule).toBe('B3/S23');
    expect(population(gun)).toBe(36);
    expect(gun.format).toBe('rle');
  });

  it('puts the cells where the runs say, including multi-row runs', () => {
    const gun = parseRle(GUN);
    const cells = liveCells(gun);
    expect(cells).toHaveLength(36);
    // The gun's two blocks sit on the left edge of row 4 and row 5.
    expect(cells).toContainEqual([0, 4]);
    expect(cells).toContainEqual([1, 4]);
    expect(cells).toContainEqual([0, 5]);
  });

  it('reads a pattern that names no rule', () => {
    const pattern = parseRle('x = 3, y = 1\n3o!');
    expect(pattern.rule).toBeNull();
    expect(population(pattern)).toBe(3);
  });

  it('refuses a pattern that overruns its header', () => {
    expect(() => parseRle('x = 2, y = 1\n3o!')).toThrow(PatternError);
    expect(() => parseRle('x = 2, y = 1\n2o$2o!')).toThrow(PatternError);
  });

  it('refuses a missing header, a missing terminator and an unknown tag', () => {
    expect(() => parseRle('3o!')).toThrow(/header/);
    expect(() => parseRle('x = 3, y = 1\n3o')).toThrow(/"!"/);
    expect(() => parseRle('x = 3, y = 1\n3q!')).toThrow(/not an RLE tag/);
  });
});
