// Tier 0: the reference stepper. One byte per cell, eight neighbour reads, no cleverness.
// It is the correctness floor, and it exists so the site works without WebAssembly.

import type { Engine } from '../index';
import { nextState, type Rule } from './rule';

export function createCpuEngine(options: {
  rule: Rule;
  width: number;
  height: number;
  cells: Uint8Array;
}): Engine {
  const { rule, width, height } = options;
  let current = Uint8Array.from(options.cells);
  const scratch = new Uint8Array(width * height);

  function stepOnce(): void {
    for (let y = 0; y < height; y++) {
      const up = (y + height - 1) % height;
      const down = (y + 1) % height;
      for (let x = 0; x < width; x++) {
        const left = (x + width - 1) % width;
        const right = (x + 1) % width;
        const neighbours =
          current[up * width + left]! +
          current[up * width + x]! +
          current[up * width + right]! +
          current[y * width + left]! +
          current[y * width + right]! +
          current[down * width + left]! +
          current[down * width + x]! +
          current[down * width + right]!;
        const alive = current[y * width + x] === 1;
        scratch[y * width + x] = nextState(rule, alive, neighbours) ? 1 : 0;
      }
    }
    current = Uint8Array.from(scratch);
  }

  return {
    width,
    height,
    rule,
    tier: 'cpu',
    step(steps: number): void {
      for (let i = 0; i < steps; i++) stepOnce();
    },
    cells(): Uint8Array {
      return current;
    },
  };
}
