import { describe, expect, it } from 'vitest';
import { curveFor, describeCurve, formatRate, nodesPerLevel, type TowerSection } from './tower';

const section: TowerSection = {
  block: 3,
  levels: 5,
  rates: [0.01, 0.4],
  trials: 1000,
  seed: 41,
  recursion: "p' = 3p^2 - 2p^3",
  curves: [
    { eps: 0.01, analytic: [0.0003, 2.7e-7, 2.2e-13], measured: [0.01, 0.0003, 2.7e-7] },
    { eps: 0.4, analytic: [0.352, 0.2842, 0.1966], measured: [0.4, 0.352, 0.2842] },
  ],
  note: 'pedagogical analogue',
};

describe('curveFor', () => {
  it('finds an exact rate and refuses a rate that is not stored', () => {
    expect(curveFor(section, 0.4)?.analytic[0]).toBeCloseTo(0.352, 6);
    expect(curveFor(section, 0.2)).toBeUndefined();
  });
});

describe('nodesPerLevel', () => {
  it('counts leaves first and one root last', () => {
    expect(nodesPerLevel(5, 3)).toEqual([243, 81, 27, 9, 3, 1]);
    expect(nodesPerLevel(1, 3)).toEqual([3, 1]);
  });
});

describe('formatRate', () => {
  it('keeps small rates readable and switches to exponent notation when they vanish', () => {
    expect(formatRate(0)).toBe('0');
    expect(formatRate(0.01)).toBe('0.0100');
    expect(formatRate(2.2e-13)).toBe('2.2e-13');
    expect(formatRate(Number.NaN)).toBe('—');
  });
});

describe('describeCurve', () => {
  it('says the error falls below the gate', () => {
    const quiet = describeCurve(section.curves[0]!);
    expect(quiet).toContain('falls');
    expect(quiet).toContain('0.0100');
  });

  it('and rises above it, where the recursion has its other fixed point', () => {
    const loud = describeCurve({ eps: 0.6, analytic: [0.648, 0.697], measured: [0.648, 0.697] });
    expect(loud).toContain('rises');
  });
});
