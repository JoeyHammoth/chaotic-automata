import { describe, expect, it } from 'vitest';
import {
  clampCamera,
  chartToScreen,
  fitZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  screenToChart,
  zoomAt,
} from '../lib/camera';

const W = 512;
const H = 512;

describe('camera', () => {
  it('clamps the camera inside the chart', () => {
    expect(clampCamera({ x: -40, y: 900, zoom: 1 }, W, H)).toEqual({ x: 0, y: 512 - 1, zoom: 1 });
    expect(clampCamera({ x: 0, y: 0, zoom: 0.01 }, W, H).zoom).toBe(MIN_ZOOM);
    expect(clampCamera({ x: 0, y: 0, zoom: 1000 }, W, H).zoom).toBe(MAX_ZOOM);
  });

  it('inverts screen and chart coordinates', () => {
    const camera = { x: 12, y: 34, zoom: 3 };
    const point = screenToChart(camera, 90, 120);
    const back = chartToScreen(camera, point.x, point.y);
    expect(back.x).toBeCloseTo(90);
    expect(back.y).toBeCloseTo(120);
  });

  it('keeps the point under the cursor fixed while zooming', () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    const before = screenToChart(camera, 200, 150);
    const zoomed = zoomAt(camera, 2, 200, 150, W, H);
    const after = screenToChart(zoomed, 200, 150);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('pans by pixels converted through the zoom', () => {
    const panned = panBy({ x: 100, y: 100, zoom: 2 }, 20, 0, W, H);
    expect(panned.x).toBeCloseTo(90);
    expect(panned.y).toBeCloseTo(100);
  });

  it('fits the chart to the frame on its short side', () => {
    // A square frame shows every cell: one viewport pixel per cell at this size.
    expect(fitZoom(512, 512, W, H)).toBe(1);
    expect(fitZoom(640, 640, W, H)).toBe(1.25);
    // A wide frame is limited by its height, which is why the map frame is square.
    expect(fitZoom(1120, 640, W, H)).toBe(1.25);
    // A phone frame is narrower than the chart, so every cell is smaller than a pixel.
    expect(fitZoom(350, 590, W, H)).toBeCloseTo(350 / 512);
  });

  it('keeps a fitted camera inside the zoom limits', () => {
    expect(fitZoom(64, 64, W, H)).toBe(MIN_ZOOM);
    expect(fitZoom(60_000, 60_000, W, H)).toBe(MAX_ZOOM);
  });

  it('never pans past the chart edge', () => {
    const panned = panBy({ x: 0, y: 0, zoom: 4 }, 10_000, 10_000, W, H);
    expect(panned.x).toBe(0);
    expect(panned.y).toBe(0);
  });
});
