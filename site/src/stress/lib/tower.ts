// The tower is an analogue and the page has to say so. Independent leaf errors, a shallow tree,
// no threshold claimed: the arithmetic here is the concatenated-majority recursion, and the
// measured column is the same tower actually built.

import type { TowerCurve, TowerSection } from './panel';

export type { TowerCurve, TowerSection };

export function curveFor(section: TowerSection, eps: number): TowerCurve | undefined {
  return section.curves.find((curve) => Math.abs(curve.eps - eps) < 1e-12);
}

/** Nodes per level, bottom-up: `block^levels` leaves down to a single root. */
export function nodesPerLevel(levels: number, block: number): number[] {
  const counts: number[] = [];
  for (let level = levels; level >= 0; level -= 1) counts.push(block ** level);
  return counts;
}

export function formatRate(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  if (value < 1e-4) return value.toExponential(1);
  return value.toFixed(4);
}

/** One sentence for the caption: where the selected noise leaves the tower after its levels. */
export function describeCurve(curve: TowerCurve): string {
  const first = curve.analytic[0] ?? 0;
  const last = curve.analytic[curve.analytic.length - 1] ?? 0;
  const measured = curve.measured[curve.measured.length - 1] ?? 0;
  const direction = last < first ? 'falls' : 'rises';
  return (
    `At ε = ${formatRate(curve.eps)} the recursion ${direction} from ${formatRate(first)} at level 1 ` +
    `to ${formatRate(last)} at level ${curve.analytic.length}; the built tower measured ` +
    `${formatRate(measured)} at its root over ${curve.measured.length} levels.`
  );
}
