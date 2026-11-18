// Colour is an argument about meaning, so it ships with the data: the pipeline writes the palette into
// the manifest and the page only reads it back. That is why a legend cannot drift from the pixels, and
// why the undecided hatch on screen is the same hatch the legend draws.

export type Rgb = readonly [number, number, number];

export interface Palette {
  classes: Record<string, Rgb>;
  ramp: [number, Rgb][];
  hatch: { light: Rgb; dark: Rgb; period: number; width: number };
  disagreement: { agree: Rgb; disagree: Rgb };
}

export interface LegendItem {
  label: string;
  colour: Rgb | null;
  hatched?: boolean;
}

export function cssColour(colour: Rgb): string {
  return `rgb(${colour[0]} ${colour[1]} ${colour[2]})`;
}

function mix(start: Rgb, end: Rgb, t: number): Rgb {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  return [
    Math.round(start[0] + (end[0] - start[0]) * clamped),
    Math.round(start[1] + (end[1] - start[1]) * clamped),
    Math.round(start[2] + (end[2] - start[2]) * clamped),
  ];
}

/** A ramp with a dark floor, so "near zero" is not confused with "no data". */
export function ramp(palette: Palette, t: number): Rgb {
  const stops = palette.ramp;
  const last = stops[stops.length - 1];
  if (!last) return [0, 0, 0];
  for (let i = 1; i < stops.length; i += 1) {
    const stop = stops[i];
    const previous = stops[i - 1];
    if (stop && previous && t <= stop[0]) {
      const width = stop[0] - previous[0];
      return mix(previous[1], stop[1], width === 0 ? 0 : (t - previous[0]) / width);
    }
  }
  return last[1];
}

export function classLegend(palette: Palette, names: string[]): LegendItem[] {
  return names.map((name) => ({
    label: name,
    colour: palette.classes[name] ?? null,
    hatched: name === 'undecided',
  }));
}

export function rampLegend(palette: Palette, min: number, max: number, steps = 5): LegendItem[] {
  const items: LegendItem[] = [];
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    items.push({ label: (min + (max - min) * t).toFixed(2), colour: ramp(palette, t) });
  }
  return items;
}

export function disagreementLegend(palette: Palette): LegendItem[] {
  return [
    { label: 'classifiers disagree', colour: palette.disagreement.disagree },
    { label: 'classifiers agree', colour: palette.disagreement.agree },
  ];
}

/** The legend swatch for undecided cells, drawn from the hatch the tiles baked into their pixels. */
export function hatchCss(palette: Palette): string {
  const { light, dark, period, width } = palette.hatch;
  return `repeating-linear-gradient(45deg, ${cssColour(light)} 0 ${width}px, ${cssColour(dark)} ${width}px ${period}px)`;
}
