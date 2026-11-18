import { describe, expect, it } from 'vitest';
import { cellsPerTile, levelFor, tilesFor, tilesPerSide, type TilePyramid } from '../lib/tiles';

const pyramid: TilePyramid = {
  size: 128,
  levels: 3,
  path: 'tiles',
  version: 'abc123',
  colourings: ['class', 'activity'],
};

const chart = { width: 512, height: 512 };
const base = '/products/atlas/';

describe('tile pyramid', () => {
  it('spans the chart at every level', () => {
    for (let level = 0; level < pyramid.levels; level += 1) {
      expect(cellsPerTile(pyramid, level) * tilesPerSide(level)).toBe(512);
    }
  });

  it('picks the coarsest level that is still finer than the screen', () => {
    expect(levelFor(0.5, 3)).toBe(1);
    expect(levelFor(1, 3)).toBe(2);
    expect(levelFor(1.5, 3)).toBe(2);
    expect(levelFor(32, 3)).toBe(2);
    expect(levelFor(0.2, 3)).toBe(0);
  });

  it('asks for one tile when the whole chart is in view', () => {
    const tiles = tilesFor({ x: 0, y: 0, zoom: 0.5 }, { width: 200, height: 200 }, chart, pyramid, base, 'class', 1);
    expect(tiles).toHaveLength(4);
    const coarse = tilesFor({ x: 0, y: 0, zoom: 0.5 }, { width: 200, height: 200 }, chart, pyramid, base, 'class', 0);
    expect(coarse).toHaveLength(1);
    expect(coarse[0]?.url).toBe('/products/atlas/tiles/class/0/0_0.png?v=abc123');
  });

  it('returns the whole chart as 16 native tiles at 1:1 and more than that in view', () => {
    const tiles = tilesFor({ x: 0, y: 0, zoom: 1 }, { width: 400, height: 400 }, chart, pyramid, base, 'class', 2);
    expect(tiles).toHaveLength(4 * 4);
  });

  it('streams only the window it is showing', () => {
    const tiles = tilesFor({ x: 400, y: 400, zoom: 16 }, { width: 900, height: 600 }, chart, pyramid, base, 'class', 2);
    expect(tiles.length).toBeLessThanOrEqual(4);
    expect(tiles.every((tile) => tile.x >= 3 && tile.y >= 3)).toBe(true);
  });

  it('clamps at the far edge instead of asking for a tile that does not exist', () => {
    const tiles = tilesFor(
      { x: 511.9, y: 511.9, zoom: 32 },
      { width: 900, height: 600 },
      chart,
      pyramid,
      base,
      'class',
      2,
    );
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({ x: 3, y: 3 });
  });
});
