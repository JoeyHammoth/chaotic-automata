// The URL is the state (design doc §4.8). `readView` never throws: a bad URL is a visible error, not
// a blank page. `steps` pins a view to a generation, which is what makes a figure reproducible.

import { canonicalRule, parseRule, RuleError, type Rule } from '../../engine';

export interface View {
  rule: Rule;
  canonical: string;
  seed: number;
  size: number;
  /** Stop after this many generations; `null` means run forever. */
  steps: number | null;
}

export type ViewResult = { ok: true; view: View } | { ok: false; message: string };

export const DEFAULT_RULE = 'B3/S23';
export const DEFAULT_SEED = 1;
export const DEFAULT_SIZE = 256;
const MIN_SIZE = 64;
const MAX_SIZE = 512;
const MAX_STEPS = 1_000_000;

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

  return { ok: true, view: { rule, canonical: canonicalRule(rule), seed, size, steps } };
}

export function writeView(base: URL, view: View): URL {
  const url = new URL(base.href);
  url.searchParams.set('rule', view.canonical);
  url.searchParams.set('seed', String(view.seed));
  if (view.size !== DEFAULT_SIZE) url.searchParams.set('size', String(view.size));
  else url.searchParams.delete('size');
  if (view.steps === null) url.searchParams.delete('steps');
  else url.searchParams.set('steps', String(view.steps));
  return url;
}
