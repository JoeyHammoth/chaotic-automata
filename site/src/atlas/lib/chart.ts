// The chart's geometry, shared with the pipeline (design §6.2): x is the birth mask, y the survival
// mask, both in reflected Gray code so a one-pixel move is a one-bit rule edit.

export const CHART_SIZE = 512;

/** The mask drawn at chart position `index`. */
export function maskAt(index: number): number {
  return index ^ (index >> 1);
}

/** Where a mask sits on the chart. */
export function indexOf(mask: number): number {
  let index = 0;
  while (mask > 0) {
    index ^= mask;
    mask >>= 1;
  }
  return index;
}

export function ruleAt(birthIndex: number, survivalIndex: number): string {
  const mask = maskAt(birthIndex) | (maskAt(survivalIndex) << 9);
  const digits = (value: number, shift: number): string => {
    let out = '';
    for (let count = 0; count < 9; count += 1) {
      if ((value >> (count + shift)) & 1) out += String(count);
    }
    return out;
  };
  return `B${digits(mask, 0)}/S${digits(mask, 9)}`;
}
