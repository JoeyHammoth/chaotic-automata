import { describe, expect, it } from 'vitest';
import { createCpuEngine, parseRule } from '../index';
import { soup } from '../lib/soup';

const W = 64;
const H = 64;

function engineWith(points: Array<[number, number]>) {
  const cells = new Uint8Array(W * H);
  for (const [x, y] of points) cells[y * W + x] = 1;
  return createCpuEngine({ rule: parseRule('B3/S23'), width: W, height: H, cells });
}

function live(cells: Uint8Array): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  cells.forEach((value, index) => {
    if (value === 1) out.push([index % W, Math.floor(index / W)]);
  });
  return out;
}

describe('cpu engine', () => {
  it('keeps a block still', () => {
    const points: Array<[number, number]> = [
      [10, 10],
      [11, 10],
      [10, 11],
      [11, 11],
    ];
    const engine = engineWith(points);
    engine.step(25);
    expect(live(engine.cells())).toEqual(points);
  });

  it('oscillates a blinker with period two', () => {
    const vertical: Array<[number, number]> = [
      [10, 9],
      [10, 10],
      [10, 11],
    ];
    const engine = engineWith(vertical);
    engine.step(1);
    expect(live(engine.cells())).toEqual([
      [9, 10],
      [10, 10],
      [11, 10],
    ]);
    engine.step(1);
    expect(live(engine.cells())).toEqual(vertical);
  });

  it('moves a glider one cell diagonally every four generations', () => {
    const engine = engineWith([
      [11, 10],
      [12, 11],
      [10, 12],
      [11, 12],
      [12, 12],
    ]);
    engine.step(4);
    expect(live(engine.cells())).toEqual([
      [12, 11],
      [13, 12],
      [11, 13],
      [12, 13],
      [13, 13],
    ]);
  });

  it('produces a reproducible soup for a seed', () => {
    const a = soup(32, 32, 7, 30);
    const b = soup(32, 32, 7, 30);
    expect(a).toEqual(b);
    const alive = a.reduce((total, cell) => total + cell, 0);
    expect(alive).toBeGreaterThan(100);
    expect(alive).toBeLessThan(400);
  });
});
