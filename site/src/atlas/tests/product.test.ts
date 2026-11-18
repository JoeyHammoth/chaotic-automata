import { describe, expect, it } from 'vitest';
import { HEADER_BYTES, parseProduct } from '../lib/product';

function buffer(options: {
  dtype: number;
  width: number;
  height: number;
  channels?: number;
  halves?: number[];
  floats?: number[];
  bytes?: number[];
  version?: number;
  magic?: string;
}): ArrayBuffer {
  const channels = options.channels ?? 1;
  const count = options.width * options.height * channels;
  const bodySize = options.dtype === 3 ? count : count * (options.dtype === 1 ? 2 : 4);
  const out = new ArrayBuffer(HEADER_BYTES + bodySize);
  const view = new DataView(out);
  const magic = options.magic ?? 'CATL';
  for (let i = 0; i < 4; i += 1) view.setUint8(i, magic.charCodeAt(i));
  view.setUint16(4, options.version ?? 1, true);
  view.setUint8(6, options.dtype);
  view.setUint8(7, channels);
  view.setUint32(8, options.width, true);
  view.setUint32(12, options.height, true);
  view.setFloat32(16, 1, true);
  view.setUint32(20, 0, true);

  if (options.dtype === 1) {
    (options.halves ?? []).forEach((half, index) => view.setUint16(HEADER_BYTES + index * 2, half, true));
  } else if (options.dtype === 2) {
    (options.floats ?? []).forEach((value, index) =>
      view.setFloat32(HEADER_BYTES + index * 4, value, true),
    );
  } else {
    new Uint8Array(out, HEADER_BYTES).set(options.bytes ?? []);
  }
  return out;
}

describe('parseProduct', () => {
  it('decodes fp16 samples', () => {
    // 0, 0.5, 1, 2 in IEEE half precision.
    const product = parseProduct(
      buffer({ dtype: 1, width: 2, height: 2, halves: [0x0000, 0x3800, 0x3c00, 0x4000] }),
    );
    expect(Array.from(product.floats)).toEqual([0, 0.5, 1, 2]);
  });

  it('decodes u8 channels', () => {
    const product = parseProduct(
      buffer({ dtype: 3, width: 2, height: 1, channels: 3, bytes: [1, 0, 255, 4, 1, 85] }),
    );
    expect(product.bytes && Array.from(product.bytes)).toEqual([1, 0, 255, 4, 1, 85]);
    expect(product.meta.channels).toBe(3);
  });

  it('reads f32 grids', () => {
    const product = parseProduct(buffer({ dtype: 2, width: 2, height: 1, floats: [0.25, 0.75] }));
    expect(Array.from(product.floats)).toEqual([0.25, 0.75]);
  });

  it('refuses a schema it does not know', () => {
    expect(() =>
      parseProduct(buffer({ dtype: 1, width: 1, height: 1, halves: [0], version: 99 })),
    ).toThrow(/schema 99/);
  });

  it('refuses a file that is not a product', () => {
    expect(() =>
      parseProduct(buffer({ dtype: 1, width: 1, height: 1, halves: [0], magic: 'NOPE' })),
    ).toThrow(/not a product file/);
  });

  it('refuses a body of the wrong length', () => {
    const complete = buffer({ dtype: 1, width: 4, height: 4, halves: Array(16).fill(0) });
    const truncated = complete.slice(0, complete.byteLength - 4);
    expect(() => parseProduct(truncated)).toThrow(/wrong length/);
  });
});
