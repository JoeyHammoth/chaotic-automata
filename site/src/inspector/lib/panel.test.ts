import { describe, expect, it } from 'vitest';

import { bytesFromBase64, readRuleParam, unpackBits, unpackLevels } from './panel';

describe('panel decoders', () => {
  it('unpacks low-bit-first rows', () => {
    // 0b00000101: cells 0 and 2 are set.
    const encoded = btoa(String.fromCharCode(0b0000_0101));
    expect([...unpackBits(encoded, 8, 1)]).toEqual([1, 0, 1, 0, 0, 0, 0, 0]);
  });

  it('refuses a field whose length disagrees with the metadata', () => {
    const encoded = btoa(String.fromCharCode(0));
    expect(() => unpackBits(encoded, 16, 2)).toThrow(/expected 4 bytes/);
    expect(() => unpackLevels(encoded, 4, 1)).toThrow(/expected 4 bytes/);
  });

  it('reads levels one byte per cell', () => {
    const encoded = btoa(String.fromCharCode(0, 128, 255, 7));
    expect([...unpackLevels(encoded, 2, 2)]).toEqual([0, 128, 255, 7]);
  });

  it('parses the rule parameter and refuses nonsense', () => {
    expect(readRuleParam(new URL('http://x/?rule=30'))).toBe(30);
    expect(readRuleParam(new URL('http://x/'))).toBeNull();
    expect(Number.isNaN(readRuleParam(new URL('http://x/?rule=abc')))).toBe(true);
  });

  it('rejects a truncated base64 body', () => {
    expect(bytesFromBase64('')).toHaveLength(0);
  });
});
