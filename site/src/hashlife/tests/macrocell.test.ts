import { describe, expect, it } from 'vitest';

import { looksLikeMacrocell, macrocellRule, parseMacrocell } from '../lib/macrocell';
import { PatternError } from '../lib/rle';

// A glider: two empty rows, then three rows of the glider, then three empty rows.
const GLIDER_LEAF = '$$..*$...*$.***$$$$';

describe('macrocell import', () => {
  it('reads a leaf as an 8x8 square trimmed to the glider', () => {
    const pattern = parseMacrocell(`[M2] (golly 2.0)\n#R B3/S23\n${GLIDER_LEAF}`);
    expect(pattern.format).toBe('macrocell');
    expect(pattern.rule).toBe('B3/S23');
    expect(pattern.width).toBe(3);
    expect(pattern.height).toBe(3);
    let population = 0;
    for (const cell of pattern.cells) population += cell;
    expect(population).toBe(5);
    // Row 0 of the trimmed box is the glider's first row shifted so its left edge is x=0.
    expect(Array.from(pattern.cells.slice(0, 3))).toEqual([0, 1, 0]);
  });

  it('places a child in the quadrant the node names', () => {
    const pattern = parseMacrocell(`[M2] (golly 2.0)\n${GLIDER_LEAF}\n4 1 0 0 0`);
    // The root is 16x16 with the glider in its north-west quadrant, so the trimmed box is the same.
    expect(pattern.width).toBe(3);
    expect(pattern.height).toBe(3);
    expect(Array.from(pattern.cells.slice(0, 3))).toEqual([0, 1, 0]);
  });

  it('keeps the generation when the file records one', () => {
    const pattern = parseMacrocell(`[M2] (golly 2.0)\n#G 4096\n${GLIDER_LEAF}`);
    expect(pattern.generation).toBe(4096);
  });

  it('refuses a node that points forward, a bad level and a missing header', () => {
    expect(() => parseMacrocell('[M2]\n4 2 0 0 0')).toThrow(/before it is defined/);
    expect(() => parseMacrocell(`[M2]\n${GLIDER_LEAF}\n3 1 0 0 0`)).toThrow(/level 4 or more/);
    expect(() => parseMacrocell(GLIDER_LEAF)).toThrow(/\[M2\]/);
    expect(() => parseMacrocell('[M2]\n4 1 2 3')).toThrow(PatternError);
  });

  it('reports the rule the file names, and nothing when it names none', () => {
    // Golly omits `#R` for the default rule, so null is the format's way of saying B3/S23.
    expect(macrocellRule('[M2] (golly 2.0)\n#R B36/S23\n$$***$')).toBe('B36/S23');
    expect(macrocellRule(`[M2] (golly 2.0)\n${GLIDER_LEAF}`)).toBe(null);
  });

  it('recognises a macrocell file by its header', () => {
    expect(looksLikeMacrocell('\n  [M2] (golly 2.0)')).toBe(true);
    expect(looksLikeMacrocell('x = 3, y = 3\nb2o$2o$bo!')).toBe(false);
  });
});
