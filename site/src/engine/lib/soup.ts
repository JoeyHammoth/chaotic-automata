// The same generator as `ca_core::seed`, so a seed means the same grid in Rust and in TypeScript.

export function xorshift32(state: number): number {
  let x = state >>> 0;
  x = (x ^ (x << 13)) >>> 0;
  x = (x ^ (x >>> 17)) >>> 0;
  x = (x ^ (x << 5)) >>> 0;
  return x;
}

export function soup(width: number, height: number, seed: number, densityPercent: number): Uint8Array {
  const cells = new Uint8Array(width * height);
  let state = seed >>> 0;
  for (let i = 0; i < cells.length; i++) {
    state = xorshift32(state);
    cells[i] = state % 100 < densityPercent ? 1 : 0;
  }
  return cells;
}
