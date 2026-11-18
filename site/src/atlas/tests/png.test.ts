import { describe, expect, it } from 'vitest';
import { readPngText, withPngText } from '../lib/png';

// A minimal but structurally valid PNG: signature, IHDR, IEND. The reader only walks chunks, so the
// CRC values here need to be present but not correct — what matters is that insertion preserves the
// bytes around it.
function minimalPng(): Uint8Array {
  const bytes: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const chunk = (type: string, payload: number[]): void => {
    bytes.push((payload.length >>> 24) & 0xff, (payload.length >>> 16) & 0xff, (payload.length >>> 8) & 0xff, payload.length & 0xff);
    for (const char of type) bytes.push(char.charCodeAt(0));
    bytes.push(...payload, 0, 0, 0, 0);
  };
  chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  chunk('IEND', []);
  return new Uint8Array(bytes);
}

describe('png provenance', () => {
  it('writes a tEXt entry that reads back', () => {
    const png = withPngText(minimalPng(), { Comment: 'Reproduce: https://example.test/#x' });
    expect(readPngText(png, 'Comment')).toBe('Reproduce: https://example.test/#x');
  });

  it('keeps the signature and IEND at the end', () => {
    const original = minimalPng();
    const png = withPngText(original, { Source: 'https://example.test/' });
    expect(Array.from(png.subarray(0, 8))).toEqual(Array.from(original.subarray(0, 8)));
    const end = String.fromCharCode(...png.subarray(png.length - 8, png.length - 4));
    expect(end).toBe('IEND');
  });

  it('returns null for an absent keyword', () => {
    expect(readPngText(minimalPng(), 'Comment')).toBeNull();
  });
});
