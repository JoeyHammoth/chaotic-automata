// The engine seam (design doc §4.6). Callers get an `Engine`; they do not learn whether it is the
// WASM fast path or the TypeScript reference, except through the `tier` they may display.

import { createCpuEngine } from './lib/cpu';
import { soup } from './lib/soup';
import { createWasmEngine } from './lib/wasm';
import type { Rule } from './lib/rule';

export type Tier = 'wasm' | 'cpu';

export interface Engine {
  readonly width: number;
  readonly height: number;
  readonly rule: Rule;
  readonly tier: Tier;
  step(steps: number): void;
  cells(): Uint8Array;
}

export interface EngineOptions {
  rule: Rule;
  width: number;
  height: number;
  seed: number;
  densityPercent?: number;
  preferTier?: Tier;
}

export async function createEngine(options: EngineOptions): Promise<Engine> {
  const densityPercent = options.densityPercent ?? 30;
  if (options.preferTier !== 'cpu') {
    const wasm = await createWasmEngine({ ...options, densityPercent });
    if (wasm) return wasm;
  }
  return createCpuEngine({
    rule: options.rule,
    width: options.width,
    height: options.height,
    cells: soup(options.width, options.height, options.seed, densityPercent),
  });
}

export { createCpuEngine } from './lib/cpu';
export { canonicalRule, parseRule, ruleFromMask, ruleMask, RuleError, type Rule } from './lib/rule';
