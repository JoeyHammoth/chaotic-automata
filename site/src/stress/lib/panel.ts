// The Stress Lab product: what the page is allowed to draw. Every run in it carries its own seed,
// so a figure and the run that made it cannot be separated, and a run that reached the cap is a
// lower bound the page must render as one.

export interface Claim {
  text: string;
  source: string;
  verified: boolean;
}

export interface ToomRun {
  seed: number;
  lifetime: number;
  capped: boolean;
}

export interface ToomPoint {
  lattice: number;
  noise: number;
  runs: ToomRun[];
  median: number;
  capped: number;
  lower_bound: boolean;
}

export interface ToomSection {
  cap: number;
  lattices: number[];
  seeds: number[];
  loss: string;
  nec: ToomPoint[];
  symmetric: ToomPoint[];
  claim: Claim;
}

export interface DkCell {
  p1: number;
  p2: number;
  active: number;
  density: number;
  seeds: number[];
}

export interface DkVerdict {
  state: 'consistent' | 'miss' | 'undecided';
  difference?: number;
  contains?: boolean;
  text: string;
}

export interface DkFit {
  lattice: number;
  delta: number | null;
  interval: (number | null)[];
  runs: number;
  seeds: number[];
  absorbed: number;
  window: number[];
  verdict: DkVerdict;
}

export interface DkSection {
  grid: number;
  diagram_lattice: number;
  diagram_steps: number;
  diagram_seeds: number[];
  critical: { p1: number; p2: number };
  literature: {
    bond: { p1: number; p2: number; pc: number };
    site: { p1: number; p2: number; pc: number };
  };
  cells: DkCell[];
  decay: {
    lattices: number[];
    seeds: number[];
    steps: number;
    window: number[];
    initial_density: number;
    bond_pc_quoted: number;
    bond_pc_used: number;
    bond_pc_grid: [number, number];
    delta_dp: number;
    delta_dp_se: number;
    tolerance: number;
    fits: DkFit[];
    claim: Claim;
  };
  claim_pc: Claim;
}

export interface PanelDocument {
  version: number;
  generator: string;
  noise: { grid: number[]; note: string };
  toom: ToomSection;
  dk: DkSection;
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/** ``1/16 = 0.0625``: the exact dyadic value, not a rounded decimal. */
export function formatNoise(value: number): string {
  const numerator = Math.round(value * 256);
  const divisor = greatestCommonDivisor(numerator, 256);
  return `${numerator / divisor}/${256 / divisor} = ${value}`;
}

/** A capped run is ``>= cap``; it is never printed as a lifetime. */
export function formatLifetime(point: ToomPoint, cap: number): string {
  return point.lower_bound ? `≥ ${cap.toLocaleString('en-US')}` : point.median.toLocaleString('en-US');
}

/** The lattice points of one rule at one noise, ordered by lattice. */
export function seriesFor(
  section: ToomSection,
  rule: 'nec' | 'symmetric',
  noise: number,
): ToomPoint[] {
  return section[rule]
    .filter((point) => Math.abs(point.noise - noise) < 1e-12)
    .sort((a, b) => a.lattice - b.lattice);
}

export function readNoiseParam(url: URL): number | null {
  const raw = url.searchParams.get('noise');
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
}

/** Snap a requested noise onto the product's grid, and say whether it was on it. */
export function nearestNoise(
  grid: number[],
  requested: number,
): { value: number; matched: boolean } {
  const first = grid[0];
  if (first === undefined) throw new Error('the noise grid is empty');
  let value = first;
  let distance = Math.abs(requested - first);
  for (const candidate of grid) {
    const gap = Math.abs(requested - candidate);
    if (gap < distance) {
      value = candidate;
      distance = gap;
    }
  }
  return { value, matched: distance < 1e-12 };
}

/** The diagram cell at ``(p1, p2)``, or undefined when the point is off the grid. */
export function cellAt(
  cells: DkCell[],
  p1: number,
  p2: number,
  grid: number,
): DkCell | undefined {
  return cells.find(
    (cell) =>
      Math.abs(cell.p1 - p1) < 0.5 / grid + 1e-9 && Math.abs(cell.p2 - p2) < 0.5 / grid + 1e-9,
  );
}

export function describeCell(cell: DkCell): string {
  const active = Math.round(cell.active * cell.seeds.length);
  return (
    `p1 = ${cell.p1.toFixed(4)}, p2 = ${cell.p2.toFixed(4)} · ` +
    `active in ${active} of ${cell.seeds.length} seeds · mean final density ${cell.density.toFixed(3)}`
  );
}
