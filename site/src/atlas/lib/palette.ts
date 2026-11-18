// Colour is an argument about meaning, so it lives in one place with its legend.

export type Rgb = readonly [number, number, number];

export const CLASS_NAMES = [
  'static',
  'periodic',
  'ordered',
  'complex',
  'chaotic',
  'undecided',
] as const;

export type ClassName = (typeof CLASS_NAMES)[number];

export const CLASS_COLOURS: Record<ClassName, Rgb> = {
  static: [58, 74, 96],
  periodic: [96, 160, 190],
  ordered: [126, 186, 132],
  complex: [240, 196, 92],
  chaotic: [226, 106, 84],
  undecided: [40, 44, 52],
};

const HATCH_LIGHT: Rgb = [96, 104, 118];
const HATCH_DARK: Rgb = [28, 31, 37];

/** Diagonal stripes for undecided cells: legible at every zoom, and distinct from any colouring. */
export function isHatchPixel(x: number, y: number): boolean {
  return (x + y) % 8 < 2;
}

export function hatchColour(x: number, y: number): Rgb {
  return isHatchPixel(x, y) ? HATCH_LIGHT : HATCH_DARK;
}

/** A ramp with a dark floor, so "near zero" is not confused with "no data". */
const RAMP: readonly { at: number; colour: Rgb }[] = [
  { at: 0, colour: [16, 20, 30] },
  { at: 0.25, colour: [46, 84, 122] },
  { at: 0.5, colour: [82, 156, 138] },
  { at: 0.75, colour: [226, 186, 84] },
  { at: 1, colour: [244, 236, 200] },
];

export function ramp(t: number): Rgb {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  for (let i = 1; i < RAMP.length; i += 1) {
    const stop = RAMP[i] as { at: number; colour: Rgb };
    const previous = RAMP[i - 1] as { at: number; colour: Rgb };
    if (clamped <= stop.at) {
      const span = stop.at - previous.at;
      const f = span === 0 ? 0 : (clamped - previous.at) / span;
      return [
        Math.round(previous.colour[0] + (stop.colour[0] - previous.colour[0]) * f),
        Math.round(previous.colour[1] + (stop.colour[1] - previous.colour[1]) * f),
        Math.round(previous.colour[2] + (stop.colour[2] - previous.colour[2]) * f),
      ];
    }
  }
  return RAMP[RAMP.length - 1]?.colour ?? [0, 0, 0];
}

/** Disagreement is its own scale: grey means the classifiers agree, red means they do not. */
export function disagreementColour(value: number): Rgb {
  const t = Math.min(1, Math.max(0, value));
  return [Math.round(60 + 180 * t), Math.round(64 - 20 * t), Math.round(78 - 40 * t)];
}

export interface LegendItem {
  label: string;
  colour: Rgb | null;
  hatched?: boolean;
}

export function classLegend(): LegendItem[] {
  return CLASS_NAMES.map((name) => ({
    label: name,
    colour: CLASS_COLOURS[name],
    hatched: name === 'undecided',
  }));
}

export function rampLegend(min: number, max: number, steps = 5): LegendItem[] {
  const items: LegendItem[] = [];
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    items.push({ label: (min + (max - min) * t).toFixed(2), colour: ramp(t) });
  }
  return items;
}

export function cssColour(colour: Rgb): string {
  return `rgb(${colour[0]} ${colour[1]} ${colour[2]})`;
}
