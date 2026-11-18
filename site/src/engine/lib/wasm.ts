// Tier 1: the packed Rust engine. It is fetched lazily and its absence is a fallback, not an error:
// the CPU reference satisfies the same interface (ADR 0004).

import type { Engine, EngineOptions } from '../index';
import { ruleMask } from './rule';

interface Exports {
  memory: WebAssembly.Memory;
  engine_init(mask: number, width: number, height: number, seed: number, density: number): number;
  engine_step(steps: number): void;
  engine_cells_ptr(): number;
  engine_width(): number;
  engine_height(): number;
}

let modulePromise: Promise<Exports | null> | null = null;

function loadModule(): Promise<Exports | null> {
  modulePromise ??= (async () => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}engine.wasm`);
      if (!response.ok) return null;
      const bytes = await response.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(bytes, {});
      return instance.exports as unknown as Exports;
    } catch {
      return null;
    }
  })();
  return modulePromise;
}

export async function createWasmEngine(options: EngineOptions): Promise<Engine | null> {
  const exports = await loadModule();
  if (!exports) return null;

  const ok = exports.engine_init(
    ruleMask(options.rule),
    options.width,
    options.height,
    options.seed,
    options.densityPercent ?? 30,
  );
  if (ok !== 1) return null;

  const cells = (): Uint8Array => {
    const pointer = exports.engine_cells_ptr();
    if (pointer === 0) return new Uint8Array(0);
    return new Uint8Array(exports.memory.buffer, pointer, options.width * options.height);
  };

  return {
    width: exports.engine_width(),
    height: exports.engine_height(),
    rule: options.rule,
    tier: 'wasm',
    step(steps: number): void {
      exports.engine_step(steps);
    },
    cells,
  };
}
