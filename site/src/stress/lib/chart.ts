// Two scales and a tick rule. The Toom chart has a log lifetime axis; the phase diagram is linear
// in p1 and p2. Keeping the mapping in one place is what lets a test check the axis rather than
// only the pixels.

export interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function logScale(
  min: number,
  max: number,
  from: number,
  to: number,
): (value: number) => number {
  if (!(min > 0) || !(max > min)) throw new Error('a log scale needs 0 < min < max');
  const low = Math.log10(min);
  const span = Math.log10(max) - low;
  return (value: number) => from + ((Math.log10(Math.max(value, min)) - low) / span) * (to - from);
}

export function linearScale(
  min: number,
  max: number,
  from: number,
  to: number,
): (value: number) => number {
  if (max === min) throw new Error('a linear scale needs a range');
  return (value: number) => from + ((value - min) / (max - min)) * (to - from);
}

/** Whole powers of ten inside ``[min, max]``, which is what a log axis should label. */
export function decadeTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  for (
    let power = Math.floor(Math.log10(min));
    power <= Math.ceil(Math.log10(max));
    power += 1
  ) {
    const value = 10 ** power;
    if (value >= min && value <= max) ticks.push(value);
  }
  return ticks;
}
