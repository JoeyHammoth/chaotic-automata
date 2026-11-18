// Painting is two steps: colour the 512x512 layer once, then blit the visible window. Repainting on
// every pan or zoom would be a per-pixel loop at 60 fps for no reason; blitting is one drawImage.

import type { Camera } from './camera';
import type { AtlasData } from './product';
import {
  CLASS_COLOURS,
  CLASS_NAMES,
  disagreementColour,
  hatchColour,
  ramp,
  type Rgb,
} from './palette';

export interface AtlasView {
  layer: string;
  disagreement: boolean;
}

export interface AtlasRenderer {
  draw(camera: Camera): void;
  repaint(): void;
  readonly layer: HTMLCanvasElement;
}

function paintLayer(data: AtlasData, view: AtlasView): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('canvas 2d context is unavailable');

  const image = context.createImageData(data.width, data.height);
  const pixels = image.data;
  const values = data.layers.get(view.layer);
  const layerMeta = data.manifest.layers.find((layer) => layer.metric === view.layer);
  const span = layerMeta ? layerMeta.max - layerMeta.min : 1;
  const floor = layerMeta ? layerMeta.min : 0;

  for (let y = 0; y < data.height; y += 1) {
    for (let x = 0; x < data.width; x += 1) {
      const cell = y * data.width + x;
      const undecided = data.classes[cell * 3 + 1] === 1;
      let colour: Rgb;
      if (view.disagreement) {
        colour = disagreementColour((data.classes[cell * 3 + 2] ?? 0) / 255);
      } else if (undecided || !values) {
        // Undecided is a state, not a gap: hatch it whatever the layer.
        colour = undecided ? hatchColour(x, y) : [20, 24, 32];
      } else if (view.layer === 'class') {
        const name = CLASS_NAMES[data.classes[cell * 3] ?? 0] ?? 'static';
        colour = CLASS_COLOURS[name];
      } else {
        const value = values[cell] ?? 0;
        colour = ramp(span === 0 ? 0 : (value - floor) / span);
      }
      const offset = cell * 4;
      pixels[offset] = colour[0];
      pixels[offset + 1] = colour[1];
      pixels[offset + 2] = colour[2];
      pixels[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

export function createAtlasRenderer(
  canvas: HTMLCanvasElement,
  data: AtlasData,
  view: AtlasView,
): AtlasRenderer {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('canvas 2d context is unavailable');
  let layer = paintLayer(data, view);

  const draw = (camera: Camera): void => {
    const width = canvas.width;
    const height = canvas.height;
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#05070a';
    context.fillRect(0, 0, width, height);
    const scale = camera.zoom;
    // The visible window in chart cells, clamped so drawImage never samples outside the layer.
    const sourceWidth = Math.min(data.width - camera.x, width / scale);
    const sourceHeight = Math.min(data.height - camera.y, height / scale);
    if (sourceWidth <= 0 || sourceHeight <= 0) return;
    context.drawImage(
      layer,
      camera.x,
      camera.y,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth * scale,
      sourceHeight * scale,
    );
  };

  return {
    draw,
    get layer() {
      return layer;
    },
    repaint(): void {
      layer = paintLayer(data, view);
      draw({ x: 0, y: 0, zoom: 1 });
    },
  };
}
