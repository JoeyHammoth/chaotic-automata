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
  type Frame,
} from '../lib/camera';

const W = 512;
const H = 512;

/** A 512 px frame showing the whole 512-cell chart: one pixel per cell. */
const WHOLE: Frame = { width: 512, height: 512, chartWidth: W, chartHeight: H };
/** A small frame, so the camera has somewhere to pan at zoom 1. */
const WINDOW: Frame = { width: 300, height: 300, chartWidth: W, chartHeight: H };
/** A desktop frame at zoom 4: 128 cells visible on each axis. */
const ZOOMED: Frame = { width: 512, height: 512, chartWidth: W, chartHeight: H };

describe('camera', () => {
  it('clamps the camera inside the chart', () => {
    expect(clampCamera({ x: -40, y: 900, zoom: 1 }, WINDOW)).toEqual({
      x: 0,
      y: 512 - 300,
      zoom: 1,
    });
    expect(clampCamera({ x: 0, y: 0, zoom: 0.01 }, WINDOW).zoom).toBe(MIN_ZOOM);
    expect(clampCamera({ x: 0, y: 0, zoom: 1000 }, WINDOW).zoom).toBe(MAX_ZOOM);
  });

  it('pins the camera when the frame already shows the whole chart', () => {
    // One pixel per cell in a 512 px frame: nothing to pan to.
    expect(clampCamera({ x: 100, y: 100, zoom: 1 }, WHOLE)).toEqual({
      x: 0,
      y: 0,
      zoom: 1,
    });
    // A frame that holds the whole chart at zoom 2 — 1024 chart pixels — on both axes.
    const wide: Frame = { width: 1280, height: 1024, chartWidth: W, chartHeight: H };
    expect(clampCamera({ x: 100, y: 100, zoom: 2 }, wide)).toEqual({ x: 0, y: 0, zoom: 2 });
    // Panning is per axis: this frame is wider than the chart at zoom 2 but shorter, so only x pins.
    const letterboxed: Frame = { width: 1280, height: 720, chartWidth: W, chartHeight: H };
    expect(clampCamera({ x: 100, y: 100, zoom: 2 }, letterboxed)).toEqual({
      x: 0,
      y: 100,
      zoom: 2,
    });
    expect(clampCamera({ x: 100, y: 500, zoom: 2 }, letterboxed).y).toBe(512 - 360);
  });

  it('stops panning at the chart edge minus the visible width', () => {
    const panned = panBy({ x: 0, y: 0, zoom: 4 }, -10_000, -10_000, ZOOMED);
    expect(panned.x).toBe(512 - 512 / 4);
    expect(panned.y).toBe(512 - 512 / 4);
  });

  it('cannot be dragged off the chart at the fitted zoom', () => {
    const fitted = fitZoom(630, 630, W, H);
    const frame: Frame = { width: 630, height: 630, chartWidth: W, chartHeight: H };
    expect(panBy({ x: 0, y: 0, zoom: fitted }, -400, -400, frame)).toEqual({
      x: 0,
      y: 0,
      zoom: fitted,
    });
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
    const zoomed = zoomAt(camera, 2, 200, 150, { ...WHOLE, width: 400, height: 400 });
    const after = screenToChart(zoomed, 200, 150);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('pans by pixels converted through the zoom', () => {
    const panned = panBy({ x: 100, y: 100, zoom: 2 }, 20, 0, ZOOMED);
    expect(panned.x).toBeCloseTo(90);
    expect(panned.y).toBeCloseTo(100);
  });

  it('never pans past the chart edge', () => {
    const panned = panBy({ x: 0, y: 0, zoom: 4 }, 10_000, 10_000, ZOOMED);
    expect(panned.x).toBe(0);
    expect(panned.y).toBe(0);
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
});
