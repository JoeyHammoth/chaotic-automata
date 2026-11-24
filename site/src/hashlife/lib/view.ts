// The zoom model, kept pure so the page's arithmetic can be tested without a canvas.
//
// A view is a window on the root's frame: `x` and `y` are the north-west corner in cells, `scale`
// is pixels per cell. Zooming out past one pixel per cell means a pixel covers a node rather than a
// cell, and that node draws as its population — which is the level-of-detail rule the design asks
// for, and the reason a 2058-cell metapixel can still be seen.

export interface View {
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 1 / 4096;
export const MAX_SCALE = 64;

/** The node level that keeps one node at roughly one pixel or larger. */
export function levelForScale(scale: number, maxLevel: number): number {
  if (!(scale > 0)) return 0;
  const cellsPerPixel = 1 / scale;
  if (cellsPerPixel <= 1) return 0;
  const level = Math.floor(Math.log2(cellsPerPixel));
  return Math.max(0, Math.min(maxLevel, level));
}

/** How many cells one rendered pixel covers at this scale. */
export function cellsPerPixel(scale: number): number {
  return Math.max(1, Math.round(1 / scale));
}

/** Clamp a view so it cannot zoom past the engine's own limits or leave the plane. */
export function clampView(view: View, edge: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale));
  const maxX = Math.max(0, edge - 1);
  return {
    scale,
    x: Math.min(maxX, Math.max(0, view.x)),
    y: Math.min(maxX, Math.max(0, view.y)),
  };
}

/** The generation counts the step control offers: powers of two, so a step is a compressed step. */
export function stepOptions(): number[] {
  return [1, 2, 4, 16, 64, 256, 1024, 4096];
}

/** A readable step size: `1 generation`, `4 generations`, `2^10 generations`. */
export function formatStep(steps: number): string {
  if (steps <= 1) return '1 generation';
  const power = Math.log2(steps);
  if (Number.isInteger(power)) return `2^${power} = ${steps} generations`;
  return `${steps} generations`;
}

/** The compressibility the tree view reports: nodes against the cells they stand for. */
export function sharing(nodes: number, level: number): { nominal: number; ratio: number } {
  const nominal = Math.pow(4, Math.max(0, level));
  if (nodes <= 0) return { nominal, ratio: 0 };
  return { nominal, ratio: nominal / nodes };
}

/** `1 node per 1,024 cells` — the number the tree view shows beside the gauge. */
export function formatSharing(nodes: number, level: number): string {
  const { nominal, ratio } = sharing(nodes, level);
  if (nodes <= 0) return 'no nodes yet';
  return `${nodes.toLocaleString('en-US')} nodes for ${nominal.toLocaleString('en-US')} nominal cells — 1 node per ${Math.round(ratio).toLocaleString('en-US')} cells`;
}

/** Memory used against the cap, as the gauge draws it. */
export function memory(nodes: number, cap: number): { fraction: number; text: string } {
  const fraction = cap <= 0 ? 0 : Math.min(1, nodes / cap);
  const percent = Math.round(fraction * 100);
  return {
    fraction,
    text: `${nodes.toLocaleString('en-US')} of ${cap.toLocaleString('en-US')} nodes (${percent}%)`,
  };
}
