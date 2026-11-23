import { describe, expect, it } from 'vitest';
import {
  cellAt,
  describeCell,
  formatLifetime,
  formatNoise,
  nearestNoise,
  readNoiseParam,
  seriesFor,
  type DkCell,
  type ToomPoint,
  type ToomSection,
} from './panel';

const point = (lattice: number, noise: number, median: number, lower: boolean): ToomPoint => ({
  lattice,
  noise,
  median,
  capped: lower ? 3 : 0,
  lower_bound: lower,
  runs: [
    { seed: 11, lifetime: median, capped: lower },
    { seed: 23, lifetime: median, capped: lower },
    { seed: 37, lifetime: median, capped: lower },
  ],
});

const section: ToomSection = {
  cap: 5000,
  lattices: [8, 16],
  seeds: [11, 23, 37],
  loss: 'half the lattice',
  nec: [point(16, 0.0625, 5000, true), point(8, 0.0625, 5000, true), point(8, 0.25, 12, false)],
  symmetric: [point(8, 0.0625, 1500, false), point(16, 0.0625, 5000, true)],
  claim: { text: 'quoted', source: 'Toom', verified: false },
};

describe('formatNoise', () => {
  it('prints the exact dyadic fraction beside the decimal', () => {
    expect(formatNoise(0.0625)).toBe('1/16 = 0.0625');
    expect(formatNoise(0.09375)).toBe('3/32 = 0.09375');
    expect(formatNoise(0.25)).toBe('1/4 = 0.25');
  });
});

describe('formatLifetime', () => {
  it('marks a capped run as a lower bound rather than a lifetime', () => {
    expect(formatLifetime(point(8, 0.0625, 5000, true), 5000)).toBe('≥ 5,000');
    expect(formatLifetime(point(8, 0.25, 1234, false), 5000)).toBe('1,234');
  });
});

describe('seriesFor', () => {
  it('returns one noise, ordered by lattice', () => {
    const nec = seriesFor(section, 'nec', 0.0625);
    expect(nec.map((entry) => entry.lattice)).toEqual([8, 16]);
    expect(nec.every((entry) => entry.noise === 0.0625)).toBe(true);
  });
});

describe('nearestNoise', () => {
  it('accepts an exact grid value and snaps anything else', () => {
    expect(nearestNoise([0.0625, 0.25], 0.25)).toEqual({ value: 0.25, matched: true });
    expect(nearestNoise([0.0625, 0.25], 0.24)).toEqual({ value: 0.25, matched: false });
  });
});

describe('readNoiseParam', () => {
  it('reads a number and rejects text', () => {
    expect(readNoiseParam(new URL('https://example.test/stress.html?noise=0.0625'))).toBe(0.0625);
    expect(readNoiseParam(new URL('https://example.test/stress.html'))).toBeNull();
    expect(readNoiseParam(new URL('https://example.test/stress.html?noise=half'))).toBeNaN();
  });
});

describe('the phase diagram cells', () => {
  const cells: DkCell[] = [
    { p1: 0.5, p2: 0.75, active: 0.5, density: 0.2, seeds: [11, 23] },
    { p1: 0.75, p2: 0.75, active: 1, density: 0.6, seeds: [11, 23] },
  ];

  it('finds the cell a click lands on', () => {
    expect(cellAt(cells, 0.75, 0.75, 16)?.density).toBe(0.6);
    expect(cellAt(cells, 0.5, 0.75, 16)?.active).toBe(0.5);
  });

  it('says how many seeds were active, not a bare fraction', () => {
    expect(describeCell(cells[0] as DkCell)).toContain('active in 1 of 2 seeds');
  });
});
