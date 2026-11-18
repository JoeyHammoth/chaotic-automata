import { describe, expect, it } from 'vitest';
import { indexOf, maskAt, ruleAt } from '../lib/chart';

describe('chart geometry', () => {
  it('round-trips masks and indices', () => {
    for (const index of [0, 1, 7, 12, 15, 108, 300, 511]) {
      expect(indexOf(maskAt(index))).toBe(index);
    }
  });

  it('keeps adjacent columns one bit apart', () => {
    for (let index = 0; index < 511; index += 1) {
      const difference = maskAt(index) ^ maskAt(index + 1);
      expect(difference & (difference - 1)).toBe(0);
    }
  });

  it('places the landmarks where the pipeline says', () => {
    expect(ruleAt(15, 8)).toBe('B3/S23');
    expect(ruleAt(112, 8)).toBe('B36/S23');
    expect(ruleAt(7, 0)).toBe('B2/S');
    expect(ruleAt(indexOf(456), indexOf(472))).toBe('B3678/S34678');
  });
});
