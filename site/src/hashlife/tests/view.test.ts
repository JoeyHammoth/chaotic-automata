import { describe, expect, it } from 'vitest';

import {
  cellsPerPixel,
  clampView,
  formatSharing,
  formatStep,
  levelForScale,
  MAX_SCALE,
  memory,
  sharing,
  stepOptions,
} from '../lib/view';

describe('level of detail', () => {
  it('draws cells when a pixel is a cell or smaller', () => {
    expect(levelForScale(1, 20)).toBe(0);
    expect(levelForScale(8, 20)).toBe(0);
    expect(cellsPerPixel(8)).toBe(1);
  });

  it('steps up a level as each pixel covers more cells', () => {
    expect(levelForScale(1 / 2, 20)).toBe(1);
    expect(levelForScale(1 / 4, 20)).toBe(2);
    expect(levelForScale(1 / 3, 20)).toBe(1);
  });

  it('never asks for a level the tree does not have', () => {
    expect(levelForScale(1 / 1024, 3)).toBe(3);
  });
});

describe('the view', () => {
  it('clamps the scale to the limits and keeps the window on the plane', () => {
    expect(clampView({ x: -5, y: -5, scale: 1000 }, 100).scale).toBe(MAX_SCALE);
    const clamped = clampView({ x: 500, y: 500, scale: 1 }, 100);
    expect(clamped.x).toBe(99);
    expect(clamped.y).toBe(99);
  });

  it('offers power-of-two steps, because a compressed step is a power of two', () => {
    const steps = stepOptions();
    for (const step of steps) expect(Number.isInteger(Math.log2(step))).toBe(true);
    expect(steps).toContain(1);
  });

  it('names a step in generations and, when it is one, as a power of two', () => {
    expect(formatStep(1)).toBe('1 generation');
    expect(formatStep(1024)).toBe('2^10 = 1024 generations');
    expect(formatStep(3)).toBe('3 generations');
  });
});

describe('sharing and memory', () => {
  it('reports nodes against the cells the root stands for', () => {
    const { nominal, ratio } = sharing(256, 5);
    expect(nominal).toBe(1024);
    expect(ratio).toBe(4);
    expect(formatSharing(256, 5)).toContain('1 node per 4 cells');
  });

  it('says when there are no nodes instead of dividing by zero', () => {
    expect(formatSharing(0, 5)).toBe('no nodes yet');
    expect(sharing(0, 5).ratio).toBe(0);
  });

  it('draws usage against the cap as a fraction and as words', () => {
    const gauge = memory(50, 200);
    expect(gauge.fraction).toBeCloseTo(0.25);
    expect(gauge.text).toContain('50 of 200 nodes (25%)');
    expect(memory(500, 200).fraction).toBe(1);
    expect(memory(10, 0).fraction).toBe(0);
  });
});
