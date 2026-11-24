// The HashLife tier: the compressed quadtree from `crates/ca-core`, reached through the module's
// own memory. The page never builds a tree in JavaScript, so the node counts and the memory gauge
// are the engine's numbers rather than an estimate.

import { parseRule, type Rule } from '../../engine';
import { ruleMask } from '../../engine/lib/rule';
import type { Pattern } from './rle';

export interface HashLife {
  readonly rule: Rule;
  generation(): number;
  population(): number;
  nodes(): number;
  cap(): number;
  capHits(): number;
  /** The level of the root: it covers `2^level` cells on an edge. */
  level(): number;
  /** Bounding box of the live cells in the root's frame. */
  bounds(): { minX: number; minY: number; maxX: number; maxY: number };
  /** Advance by `generations`; false when the node cap or the level limit refused it. */
  step(generations: number): boolean;
  /**
   * A `cells x cells` window of nodes at `level`, each byte the node's population (capped at 255).
   * Level 0 is one byte per cell.
   */
  view(level: number, x: number, y: number, cells: number): Uint8Array;
}

interface Exports {
  memory: WebAssembly.Memory;
  hl_input(len: number): number;
  hl_load(mask: number, width: number, height: number): number;
  hl_step(generations: number): number;
  hl_generation(): number;
  hl_population(): number;
  hl_node_count(): number;
  hl_cap(): number;
  hl_cap_hits(): number;
  hl_level(): number;
  hl_bounds_ptr(): number;
  hl_view(level: number, x: number, y: number, cells: number): number;
}

let modulePromise: Promise<Exports | null> | null = null;

function loadModule(): Promise<Exports | null> {
  modulePromise ??= (async () => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}engine.wasm`);
      if (!response.ok) return null;
      const bytes = await response.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(bytes, {});
      const exports = instance.exports as unknown as Exports;
      // The torus entry points and the HashLife ones share one module; a module without these is
      // an older build, and the page says so instead of drawing an empty plane.
      if (typeof exports.hl_load !== 'function') return null;
      return exports;
    } catch {
      return null;
    }
  })();
  return modulePromise;
}

export async function createHashLife(pattern: Pattern): Promise<HashLife | null> {
  const exports = await loadModule();
  if (!exports) return null;
  const rule = pattern.rule === null ? parseRule('B3/S23') : parseRule(pattern.rule);

  const pointer = exports.hl_input(pattern.cells.length);
  if (pointer === 0) return null;
  new Uint8Array(exports.memory.buffer, pointer, pattern.cells.length).set(pattern.cells);
  if (exports.hl_load(ruleMask(rule), pattern.width, pattern.height) !== 1) return null;

  return {
    rule,
    generation: () => exports.hl_generation(),
    population: () => exports.hl_population(),
    nodes: () => exports.hl_node_count(),
    cap: () => exports.hl_cap(),
    capHits: () => exports.hl_cap_hits(),
    level: () => exports.hl_level(),
    bounds() {
      const pointer = exports.hl_bounds_ptr();
      const view = new Int32Array(exports.memory.buffer, pointer, 4);
      return {
        minX: view[0] ?? 0,
        minY: view[1] ?? 0,
        maxX: view[2] ?? 0,
        maxY: view[3] ?? 0,
      };
    },
    step(generations: number): boolean {
      return exports.hl_step(generations) === 1;
    },
    view(level: number, x: number, y: number, cells: number): Uint8Array {
      const pointer = exports.hl_view(level, x, y, cells);
      if (pointer === 0) return new Uint8Array(0);
      // Copy out: the next call reuses the module's buffer.
      return new Uint8Array(exports.memory.buffer, pointer, cells * cells).slice();
    },
  };
}
