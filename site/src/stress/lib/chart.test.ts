import { describe, expect, it } from 'vitest';
import { decadeTicks, linearScale, logScale } from './chart';

describe('logScale', () => {
  it('puts a decade a third of the way up a three-decade axis', () => {
    const y = logScale(1, 1000, 0, 300);
    expect(y(1)).toBeCloseTo(0);
    expect(y(10)).toBeCloseTo(100);
    expect(y(1000)).toBeCloseTo(300);
  });

  it('refuses a domain it cannot take a logarithm of', () => {
    expect(() => logScale(0, 10, 0, 100)).toThrow();
    expect(() => logScale(10, 10, 0, 100)).toThrow();
  });
});

describe('linearScale', () => {
  it('maps the endpoints and the middle', () => {
    const x = linearScale(0, 1, 20, 120);
    expect(x(0)).toBeCloseTo(20);
    expect(x(0.25)).toBeCloseTo(45);
    expect(x(1)).toBeCloseTo(120);
  });
});

describe('decadeTicks', () => {
  it('returns the powers of ten inside the range', () => {
    expect(decadeTicks(1, 5000)).toEqual([1, 10, 100, 1000]);
    expect(decadeTicks(10, 100)).toEqual([10, 100]);
  });
});
