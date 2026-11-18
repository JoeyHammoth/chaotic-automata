// Which pre-rendered tiles a view needs. Pure maths, so the pyramid can be tested without a browser:
// the answers here decide how many kilobytes a pan costs.

export interface TilePyramid {
  size: number;
  levels: number;
  path: string;
  version: string;
  colourings: string[];
}

export interface TileRef {
  level: number;
  x: number;
  y: number;
  url: string;
}

export interface ChartSize {
  width: number;
  height: number;
}

/** Cells one tile covers at `level`; the finest level is one pixel per cell. */
export function cellsPerTile(pyramid: TilePyramid, level: number): number {
  return pyramid.size * 2 ** (pyramid.levels - 1 - level);
}

export function tilesPerSide(level: number): number {
  return 2 ** level;
}

/** The coarsest level that is still at least as fine as the screen. */
export function levelFor(zoom: number, levels: number): number {
  const raw = Math.ceil(Math.log2(Math.max(zoom, Number.EPSILON))) + (levels - 1);
  return Math.min(levels - 1, Math.max(0, raw));
}

export function tileUrl(
  base: string,
  pyramid: TilePyramid,
  colouring: string,
  level: number,
  x: number,
  y: number,
): string {
  return `${base}${pyramid.path}/${colouring}/${level}/${x}_${y}.png?v=${pyramid.version}`;
}

/** Every tile of `level` that intersects the visible window, clamped to the chart. */
export function tilesFor(
  camera: { x: number; y: number; zoom: number },
  viewport: { width: number; height: number },
  chart: ChartSize,
  pyramid: TilePyramid,
  base: string,
  colouring: string,
  level: number,
): TileRef[] {
  const span = cellsPerTile(pyramid, level);
  const side = tilesPerSide(level);
  const right = Math.min(chart.width, camera.x + viewport.width / camera.zoom);
  const bottom = Math.min(chart.height, camera.y + viewport.height / camera.zoom);
  const clampIndex = (value: number): number => Math.min(side - 1, Math.max(0, value));
  const x0 = clampIndex(Math.floor(camera.x / span));
  const x1 = clampIndex(Math.ceil(right / span) - 1);
  const y0 = clampIndex(Math.floor(camera.y / span));
  const y1 = clampIndex(Math.ceil(bottom / span) - 1);

  const tiles: TileRef[] = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      tiles.push({ level, x, y, url: tileUrl(base, pyramid, colouring, level, x, y) });
    }
  }
  return tiles;
}
