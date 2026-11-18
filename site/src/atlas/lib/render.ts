// The map is pre-rendered, so drawing is a loop over the visible tiles: coarsest level first, finest on
// top. A missing tile never leaves a hole — its parent is already underneath — and a pan only pays for
// the tiles that entered the window.

import type { Camera } from './camera';
import { cellsPerTile, levelFor, tilesFor, type ChartSize, type TilePyramid } from './tiles';

export interface AtlasView {
  layer: string;
  disagreement: boolean;
}

export interface TileRendererOptions {
  /** Product directory URL, ending in a slash. */
  base: string;
  chart: ChartSize;
  pyramid: TilePyramid;
  view: AtlasView;
  background?: string;
  /** Called whenever newly arrived tiles change the picture. */
  onPaint?: () => void;
}

export interface AtlasRenderer {
  draw(camera: Camera): void;
  readonly loaded: number;
  readonly pending: number;
}

export function createAtlasRenderer(
  canvas: HTMLCanvasElement,
  options: TileRendererOptions,
): AtlasRenderer {
  const found = canvas.getContext('2d', { alpha: false });
  if (!found) throw new Error('canvas 2d context is unavailable');
  const context = found;
  const { base, chart, pyramid, view } = options;
  const images = new Map<string, HTMLImageElement>();
  const pending = new Map<string, HTMLImageElement>();
  const broken = new Set<string>();
  let camera: Camera | null = null;
  let scheduled = 0;

  const schedule = (): void => {
    if (scheduled) return;
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      if (camera) draw(camera);
      options.onPaint?.();
    });
  };

  function request(url: string): void {
    if (images.has(url) || pending.has(url) || broken.has(url)) return;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      pending.delete(url);
      images.set(url, image);
      schedule();
    };
    image.onerror = () => {
      pending.delete(url);
      broken.add(url);
      schedule();
    };
    pending.set(url, image);
    image.src = url;
  }

  function draw(next: Camera): void {
    camera = next;
    const width = canvas.width;
    const height = canvas.height;
    context.imageSmoothingEnabled = false;
    context.fillStyle = options.background ?? '#05070a';
    context.fillRect(0, 0, width, height);

    const colouring = view.disagreement ? 'disagreement' : view.layer;
    const target = levelFor(next.zoom, pyramid.levels);
    for (let level = 0; level <= target; level += 1) {
      const cells = cellsPerTile(pyramid, level);
      const span = cells * next.zoom;
      for (const tile of tilesFor(next, { width, height }, chart, pyramid, base, colouring, level)) {
        const image = images.get(tile.url);
        if (!image) {
          request(tile.url);
          continue;
        }
        context.drawImage(
          image,
          (tile.x * cells - next.x) * next.zoom,
          (tile.y * cells - next.y) * next.zoom,
          span,
          span,
        );
      }
    }
  }

  return {
    draw,
    get loaded(): number {
      return images.size;
    },
    get pending(): number {
      return pending.size;
    },
  };
}
