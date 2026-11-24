// The noise overlay's arithmetic: measured structure per rule sample, interpolated in epsilon.
// Nothing here paints. The page and the tests both read it, so the legend and the pixels cannot
// disagree about where the threshold sits.

import type { LegendItem, Rgb } from './palette';

export interface NoiseAnchor {
  num: number;
  den: number;
  eps: number;
  path: string;
  bytes: number;
  collapsed_fraction: number;
  sha256: string;
}

export interface NoiseManifest {
  version: number;
  kind: string;
  generator: string;
  chart: number;
  sample: number;
  grid: number;
  lattice: number;
  steps: number;
  soup_seed: number;
  noise_seed: number;
  slider_unit: number;
  threshold: number;
  statistic: string;
  note: string;
  anchors: NoiseAnchor[];
}

/** The slider counts in 1/slider_unit, so every position is an exact dyadic rate. */
export function epsFromStep(step: number, unit: number): number {
  return step / unit;
}

/** Where an epsilon sits between the stored levels: [lower index, upper index, fraction]. */
export function bracket(anchors: NoiseAnchor[], eps: number): [number, number, number] {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (!first || !last) return [0, 0, 0];
  if (eps <= first.eps) return [0, 0, 0];
  if (eps >= last.eps) return [anchors.length - 1, anchors.length - 1, 0];
  for (let index = 1; index < anchors.length; index += 1) {
    const upper = anchors[index];
    const lower = anchors[index - 1];
    if (upper && lower && eps <= upper.eps) {
      const span = upper.eps - lower.eps;
      const t = span === 0 ? 0 : (eps - lower.eps) / span;
      // Landing exactly on a stored level is not an interpolation, and must not round to one.
      if (t <= 0) return [index - 1, index - 1, 0];
      if (t >= 1) return [index, index, 0];
      return [index - 1, index, t];
    }
  }
  return [anchors.length - 1, anchors.length - 1, 0];
}

/** The stored grid at `eps`, linearly interpolated between the two levels that bracket it. */
export function sampleScores(
  levels: Uint8Array[],
  anchors: NoiseAnchor[],
  eps: number,
): Float32Array {
  const [lowIndex, highIndex, t] = bracket(anchors, eps);
  const low = levels[lowIndex];
  const high = levels[highIndex];
  if (!low) return new Float32Array(0);
  const out = new Float32Array(low.length);
  if (!high || lowIndex === highIndex || t === 0) {
    for (let index = 0; index < low.length; index += 1) out[index] = (low[index] ?? 0) / 255;
    return out;
  }
  for (let index = 0; index < low.length; index += 1) {
    const a = (low[index] ?? 0) / 255;
    const b = (high[index] ?? 0) / 255;
    out[index] = a + (b - a) * t;
  }
  return out;
}

export function isCollapsed(score: number, threshold: number): boolean {
  return score < threshold;
}

/** The ramp for a surviving sample: dark teal to bright teal, so low structure is not black. */
export function overlayColour(score: number): Rgb {
  const t = Math.min(1, Math.max(0, score));
  return [Math.round(24 + 96 * t), Math.round(70 + 160 * t), Math.round(82 + 140 * t)];
}

export function formatEpsilon(eps: number): string {
  if (eps === 0) return '0';
  for (const den of [8, 16, 32, 64, 128, 256, 512, 1024]) {
    const num = eps * den;
    if (Math.abs(num - Math.round(num)) < 1e-9) {
      return `${Math.round(num)}/${den} = ${eps.toFixed(4)}`;
    }
  }
  return eps.toFixed(4);
}

export function overlayNote(manifest: NoiseManifest): string {
  return (
    `${manifest.grid}×${manifest.grid} samples over the ${manifest.chart}×${manifest.chart} chart ` +
    `(every ${manifest.sample}th index), each one a ${manifest.lattice}×${manifest.lattice} torus ` +
    `for ${manifest.steps} steps · soup seed ${manifest.soup_seed}, noise seed ` +
    `${manifest.noise_seed} · collapsed below ${manifest.threshold.toFixed(2)} excess agreement`
  );
}

/** Two legend entries, one of them hatched: the threshold is named, not implied by a colour. */
export function overlayLegend(manifest: NoiseManifest): LegendItem[] {
  return [
    {
      label: `structure survives (≥ ${manifest.threshold.toFixed(2)})`,
      colour: overlayColour(1),
    },
    {
      label: `collapsed (< ${manifest.threshold.toFixed(2)}): uniform or noise-dominated`,
      colour: null,
      hatched: true,
    },
  ];
}
