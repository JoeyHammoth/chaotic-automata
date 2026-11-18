// The URL is the state (design doc §4.8). `readView` never throws: a bad URL is a visible error, not
// a blank page. `steps` pins a live rule to a generation, which is what makes a figure reproducible;
// `metric`, `dis` and the camera pin the map view itself.

import { canonicalRule, parseRule, RuleError, type Rule } from '../../engine';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface View {
  rule: Rule;
  canonical: string;
  seed: number;
  size: number;
  /** Stop after this many generations; `null` means run forever. */
  steps: number | null;
  /** Chart colouring: `class` or a metric layer name. */
  metric: string;
  /** Show the classifier-disagreement layer instead of the metric. */
  disagreement: boolean;
  camera: Camera;
}

export type ViewResult = { ok: true; view: View } | { ok: false; message: string };

export const DEFAULT_RULE = 'B3/S23';
export const DEFAULT_SEED = 1;
export const DEFAULT_SIZE = 128;
export const DEFAULT_METRIC = 'class';
export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };
const MIN_SIZE = 64;
const MAX_SIZE = 512;
const MAX_STEPS = 1_000_000;
const CHART = 512;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 32;

function readCamera(params: URLSearchParams): Camera | string {
  const rawX = params.get('x');
  const rawY = params.get('y');
  const rawZoom = params.get('z');
  const x = rawX === null ? DEFAULT_CAMERA.x : Number(rawX);
  const y = rawY === null ? DEFAULT_CAMERA.y : Number(rawY);
  const zoom = rawZoom === null ? DEFAULT_CAMERA.zoom : Number(rawZoom);
  if (!Number.isFinite(x) || x < 0 || x > CHART || !Number.isFinite(y) || y < 0 || y > CHART) {
    return `Cannot read the view: x and y must be chart coordinates in 0..${CHART}`;
  }
  if (!Number.isFinite(zoom) || zoom < MIN_ZOOM || zoom > MAX_ZOOM) {
    return `Cannot read the view: z must be between ${MIN_ZOOM} and ${MAX_ZOOM}`;
  }
  return { x, y, zoom };
}

export function readView(url: URL): ViewResult {
  const params = url.searchParams;

  let rule: Rule;
  try {
    rule = parseRule(params.get('rule') ?? DEFAULT_RULE);
  } catch (error) {
    const message = error instanceof RuleError ? error.message : String(error);
    return { ok: false, message: `Cannot read the rule: ${message}` };
  }

  const rawSeed = params.get('seed');
  const seed = rawSeed === null ? DEFAULT_SEED : Number(rawSeed);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    return { ok: false, message: `Cannot read the seed: '${rawSeed}' is not an integer in 0..2^32-1` };
  }

  const rawSize = params.get('size');
  const size = rawSize === null ? DEFAULT_SIZE : Number(rawSize);
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE || size % 64 !== 0) {
    return {
      ok: false,
      message: `Cannot read the size: '${rawSize}' must be a multiple of 64 between ${MIN_SIZE} and ${MAX_SIZE}`,
    };
  }

  const rawSteps = params.get('steps');
  const steps = rawSteps === null ? null : Number(rawSteps);
  if (rawSteps !== null && (!Number.isInteger(steps) || (steps as number) < 0 || (steps as number) > MAX_STEPS)) {
    return {
      ok: false,
      message: `Cannot read the steps: '${rawSteps}' must be an integer in 0..${MAX_STEPS}`,
    };
  }

  const metric = params.get('metric') ?? DEFAULT_METRIC;
  if (!/^[a-z_]+$/.test(metric)) {
    return { ok: false, message: `Cannot read the metric: '${metric}' is not a layer name` };
  }

  const camera = readCamera(params);
  if (typeof camera === 'string') return { ok: false, message: camera };

  return {
    ok: true,
    view: {
      rule,
      canonical: canonicalRule(rule),
      seed,
      size,
      steps,
      metric,
      disagreement: params.get('dis') === '1',
      camera,
    },
  };
}

export function writeView(base: URL, view: View): URL {
  // Start from a clean query: the canonical URL is the state, and stray parameters are not state.
  const url = new URL(base.pathname, base.origin);
  url.hash = base.hash;
  url.searchParams.set('rule', view.canonical);
  url.searchParams.set('seed', String(view.seed));
  if (view.size !== DEFAULT_SIZE) url.searchParams.set('size', String(view.size));
  else url.searchParams.delete('size');
  if (view.steps === null) url.searchParams.delete('steps');
  else url.searchParams.set('steps', String(view.steps));
  if (view.metric !== DEFAULT_METRIC) url.searchParams.set('metric', view.metric);
  else url.searchParams.delete('metric');
  if (view.disagreement) url.searchParams.set('dis', '1');
  else url.searchParams.delete('dis');
  const { x, y, zoom } = view.camera;
  if (x !== DEFAULT_CAMERA.x) url.searchParams.set('x', String(round(x)));
  else url.searchParams.delete('x');
  if (y !== DEFAULT_CAMERA.y) url.searchParams.set('y', String(round(y)));
  else url.searchParams.delete('y');
  if (zoom !== DEFAULT_CAMERA.zoom) url.searchParams.set('z', String(round(zoom)));
  else url.searchParams.delete('z');
  return url;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
