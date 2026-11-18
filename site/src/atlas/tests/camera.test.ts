import { describe, expect, it } from 'vitest';
import {
  clampCamera,
  chartToScreen,
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

  it('never pans past the chart edge', () => {
    const panned = panBy({ x: 0, y: 0, zoom: 4 }, 10_000, 10_000, W, H);
    expect(panned.x).toBe(0);
    expect(panned.y).toBe(0);
  });
});
