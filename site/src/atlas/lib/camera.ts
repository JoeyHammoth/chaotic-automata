// Camera maths lives apart from the DOM so it can be tested without a browser.
//
// `x`/`y` are the chart coordinates at the top-left of the viewport; `zoom` is screen pixels per cell.

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 32;

/**
 * The zoom at which the whole chart fits the viewport, in viewport pixels per cell.
 *
 * The map draws from the top-left of the canvas, so a frame the same shape as the chart fills
 * exactly when the camera starts at this zoom. The short side is the constraint, which is why the
 * frame is square: a wide frame would fit the chart vertically and leave the rest as background.
 */
export function fitZoom(
  viewportWidth: number,
  viewportHeight: number,
  chartWidth: number,
  chartHeight: number,
): number {
  const fit = Math.min(viewportWidth / chartWidth, viewportHeight / chartHeight);
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fit));
}

export function clampCamera(camera: Camera, chartWidth: number, chartHeight: number): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom));
  const visibleWidth = Math.min(chartWidth, 1 / zoom);
  const visibleHeight = Math.min(chartHeight, 1 / zoom);
  return {
    zoom,
    x: Math.min(Math.max(0, camera.x), chartWidth - visibleWidth),
    y: Math.min(Math.max(0, camera.y), chartHeight - visibleHeight),
  };
}

/** Screen pixels to chart coordinates. */
export function screenToChart(
  camera: Camera,
  px: number,
  py: number,
): { x: number; y: number } {
  return { x: camera.x + px / camera.zoom, y: camera.y + py / camera.zoom };
}

/** Chart coordinates to screen pixels. */
export function chartToScreen(
  camera: Camera,
  x: number,
  y: number,
): { x: number; y: number } {
  return { x: (x - camera.x) * camera.zoom, y: (y - camera.y) * camera.zoom };
}

/** Zoom keeping the chart point under the cursor fixed. */
export function zoomAt(
  camera: Camera,
  factor: number,
  px: number,
  py: number,
  chartWidth: number,
  chartHeight: number,
): Camera {
  const before = screenToChart(camera, px, py);
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor));
  return clampCamera(
    { zoom, x: before.x - px / zoom, y: before.y - py / zoom },
    chartWidth,
    chartHeight,
  );
}

export function panBy(
  camera: Camera,
  dxPixels: number,
  dyPixels: number,
  chartWidth: number,
  chartHeight: number,
): Camera {
  return clampCamera(
    { ...camera, x: camera.x - dxPixels / camera.zoom, y: camera.y - dyPixels / camera.zoom },
    chartWidth,
    chartHeight,
  );
}
