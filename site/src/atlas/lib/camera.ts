// Camera maths lives apart from the DOM so it can be tested without a browser.
//
// `x`/`y` are the chart coordinates at the top-left of the viewport; `zoom` is viewport pixels per cell.

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

/** What the renderer can show: the canvas in camera pixels, and the chart in cells. */
export interface Frame {
  width: number;
  height: number;
  chartWidth: number;
  chartHeight: number;
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

/**
 * Clamp a camera so it cannot show anything outside the chart.
 *
 * The number of cells the frame can hold is `frame.width / zoom`, so when the frame is larger than
 * the chart the camera is pinned at the origin — there is nothing to pan to — and otherwise it stops
 * with the chart's edge at the frame's edge. Clamping against the chart alone (or against one pixel
 * of it) would let a drag push the map off-screen.
 */
export function clampCamera(camera: Camera, frame: Frame): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom));
  const visibleWidth = frame.width / zoom;
  const visibleHeight = frame.height / zoom;
  return {
    zoom,
    x: Math.min(Math.max(0, camera.x), Math.max(0, frame.chartWidth - visibleWidth)),
    y: Math.min(Math.max(0, camera.y), Math.max(0, frame.chartHeight - visibleHeight)),
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
  frame: Frame,
): Camera {
  const before = screenToChart(camera, px, py);
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor));
  return clampCamera(
    { zoom, x: before.x - px / zoom, y: before.y - py / zoom },
    frame,
  );
}

export function panBy(
  camera: Camera,
  dxPixels: number,
  dyPixels: number,
  frame: Frame,
): Camera {
  return clampCamera(
    { ...camera, x: camera.x - dxPixels / camera.zoom, y: camera.y - dyPixels / camera.zoom },
    frame,
  );
}
