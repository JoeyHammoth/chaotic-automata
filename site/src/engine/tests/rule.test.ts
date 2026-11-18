import { describe, expect, it } from 'vitest';
import { canonicalRule, parseRule, RuleError, ruleFromMask, ruleMask } from '../index';

describe('rule parsing', () => {
  it('canonicalises case, whitespace and duplicate digits', () => {
    const cases: Array<[string, string]> = [
      ['B3/S23', 'B3/S23'],
      ['b3/s23', 'B3/S23'],
      ['  B3/S23  ', 'B3/S23'],
      ['B33/S233', 'B3/S23'],
      ['B2/S', 'B2/S'],
      ['B/S', 'B/S'],
      ['B0/S8', 'B0/S8'],
      ['B012345678/S012345678', 'B012345678/S012345678'],
    ];
    for (const [input, expected] of cases) {
      const rule = parseRule(input);
      expect(canonicalRule(rule), input).toBe(expected);
      expect(canonicalRule(parseRule(canonicalRule(rule))), input).toBe(expected);
    }
  });

  it('round-trips through the 18-bit mask', () => {
    for (const text of ['B3/S23', 'B0/S', 'B/S012345678', 'B36/S23']) {
      const rule = parseRule(text);
      expect(ruleFromMask(ruleMask(rule))).toEqual(rule);
    }
    // birth B3 at bit 3; survival S23 at bits 9+2 and 9+3.
    expect(ruleMask(parseRule('B3/S23'))).toBe((1 << 3) | (1 << 11) | (1 << 12));
  });

  it('rejects malformed rules with a specific message', () => {
    const cases: Array<[string, RegExp]> = [
      ['', /empty/],
      ['B3', /one '\//],
      ['B3/S23/1', /one '\//],
      ['B9/S23', /out of range/],
      ['B3/S2x', /not a digit/],
      ['3/23', /expected 'B'/],
      ['S23/B3', /expected 'B'/],
    ];
    for (const [input, pattern] of cases) {
      expect(() => parseRule(input), input).toThrow(RuleError);
      expect(() => parseRule(input), input).toThrow(pattern);
    }
  });
});
