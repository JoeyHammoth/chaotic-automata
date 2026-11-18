// A figure is a URL plus a version hash, never a screenshot (design §7.7). The export writes the
// reproduce link into the PNG itself, so a downloaded image carries its provenance.

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function textChunk(keyword: string, text: string): Uint8Array {
  const payload = new TextEncoder().encode(`${keyword}\0${text}`);
  const chunk = new Uint8Array(12 + payload.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, payload.length);
  chunk.set(new TextEncoder().encode('tEXt'), 4);
  chunk.set(payload, 8);
  view.setUint32(8 + payload.length, crc32(chunk.subarray(4, 8 + payload.length)));
  return chunk;
}

/** Insert `tEXt` chunks just before IEND, leaving the rest of the file untouched. */
export function withPngText(png: Uint8Array, entries: Record<string, string>): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8; // signature
  while (offset + 8 <= png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      png[offset + 4] ?? 0,
      png[offset + 5] ?? 0,
      png[offset + 6] ?? 0,
      png[offset + 7] ?? 0,
    );
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  const chunks = Object.entries(entries).map(([keyword, text]) => textChunk(keyword, text));
  const inserted = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(png.length + inserted);
  out.set(png.subarray(0, offset), 0);
  let cursor = offset;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  out.set(png.subarray(offset), cursor);
  return out;
}

/** Read back a `tEXt` entry; used by tests and by anyone verifying a downloaded figure. */
export function readPngText(png: Uint8Array, keyword: string): string | null {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  while (offset + 8 <= png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      png[offset + 4] ?? 0,
      png[offset + 5] ?? 0,
      png[offset + 6] ?? 0,
      png[offset + 7] ?? 0,
    );
    if (type === 'tEXt') {
      const payload = png.subarray(offset + 8, offset + 8 + length);
      const split = payload.indexOf(0);
      const name = new TextDecoder().decode(payload.subarray(0, split));
      if (name === keyword) return new TextDecoder().decode(payload.subarray(split + 1));
    }
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  return null;
}
