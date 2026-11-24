// Loading and painting the overlay. The product is measured offline, so the page never simulates:
// it interpolates between stored levels and draws them with the map's own camera.

import type { Camera } from './camera';
import { isCollapsed, overlayColour, sampleScores, type NoiseManifest } from './noise';
import type { Rgb } from './palette';
import type { ChartSize } from './tiles';

export interface NoiseProduct {
  manifest: NoiseManifest;
  levels: Uint8Array[];
}

export interface Hatch {
  light: Rgb;
  dark: Rgb;
}

const DEFAULT_HATCH: Hatch = { light: [90, 100, 112], dark: [12, 16, 21] };

export async function loadNoise(
  base: string,
  fetchImpl: typeof fetch = fetch,
): Promise<NoiseProduct> {
  const response = await fetchImpl(`${base}manifest.json`);
  if (!response.ok) throw new Error(`cannot load ${base}manifest.json: ${response.status}`);
  const manifest = (await response.json()) as NoiseManifest;
  const levels: Uint8Array[] = [];
  for (const anchor of manifest.anchors) {
    const data = await fetchImpl(`${base}${anchor.path}`);
    if (!data.ok) throw new Error(`cannot load ${anchor.path}: ${data.status}`);
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (bytes.length !== manifest.grid * manifest.grid) {
      throw new Error(
        `${anchor.path} is ${bytes.length} bytes, expected ${manifest.grid * manifest.grid}`,
      );
    }
    levels.push(bytes);
  }
  return { manifest, levels };
}

/** Paint the overlay at chart resolution: each sample covers `sample` by `sample` chart cells. */
export function paintOverlay(
  canvas: HTMLCanvasElement,
  product: NoiseProduct,
  eps: number,
  hatch: Hatch = DEFAULT_HATCH,
): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const { manifest } = product;
  const { chart, grid, sample, threshold } = manifest;
  canvas.width = chart;
  canvas.height = chart;
  const scores = sampleScores(product.levels, manifest.anchors, eps);
  const image = context.createImageData(chart, chart);
  const data = image.data;
  for (let gy = 0; gy < grid; gy += 1) {
    for (let gx = 0; gx < grid; gx += 1) {
      const score = scores[gy * grid + gx] ?? 0;
      const collapsed = isCollapsed(score, threshold);
      const [r, g, b] = collapsed ? hatch.dark : overlayColour(score);
      for (let py = 0; py < sample; py += 1) {
        const y = gy * sample + py;
        for (let px = 0; px < sample; px += 1) {
          const x = gx * sample + px;
          const offset = (y * chart + x) * 4;
          // A diagonal stripe inside each collapsed sample: the cue survives colour blindness and
          // a monochrome export, which a hue change alone would not.
          const stripe = collapsed && (px + py) % 4 === 0;
          data[offset] = stripe ? hatch.light[0] : r;
          data[offset + 1] = stripe ? hatch.light[1] : g;
          data[offset + 2] = stripe ? hatch.light[2] : b;
          data[offset + 3] = 255;
        }
      }
    }
  }
  context.putImageData(image, 0, 0);
}

/** Draw the painted overlay with the map's camera, so the two layers cannot drift apart. */
export function drawOverlay(
  context: CanvasRenderingContext2D | null,
  overlay: HTMLCanvasElement,
  camera: Camera,
  chart: ChartSize,
): void {
  if (!context) return;
  context.save();
  context.imageSmoothingEnabled = false;
  context.globalAlpha = 0.85;
  context.drawImage(
    overlay,
    -camera.x * camera.zoom,
    -camera.y * camera.zoom,
    chart.width * camera.zoom,
    chart.height * camera.zoom,
  );
  context.restore();
}
