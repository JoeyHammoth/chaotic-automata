// Macrocell import: the format Golly uses for universes too big to write as RLE.
//
// Header `[M2] (golly 2.0)`, then `#R rule` and `#G generation` lines, then a child-first quadtree.
// A two-state leaf is an 8x8 raster of `.`, `*` and `$` (end of row, trailing dead cells omitted).
// A node with children is five integers: the log2 of its side, then its NW, NE, SW, SE children.
// Node 0 is the all-dead square, and nodes are numbered from 1 in file order.
//
// The tree is flattened to a grid here, because the wasm loader takes a grid: one copy into the
// module's memory and the page is done. Flattening a metapixel is a few megabytes, which is the
// price of not re-implementing the quadtree in JavaScript.

import { PatternError, type Pattern } from './rle';

interface Node {
  level: number;
  cells?: Uint8Array;
  quads?: [number, number, number, number];
}

const LEAF_LEVEL = 3;
const LEAF_SIDE = 8;

function leaf(line: string): Node {
  // `$` terminates a row, so a full eight-row leaf ends with a `$` and splits into nine pieces.
  // The trailing empty piece is that terminator, not a ninth row.
  const rows = line.split('$');
  while (rows.length > LEAF_SIDE && rows[rows.length - 1] === '') rows.pop();
  if (rows.length > LEAF_SIDE) throw new PatternError('a macrocell leaf has at most eight rows');
  const cells = new Uint8Array(LEAF_SIDE * LEAF_SIDE);
  rows.forEach((row, y) => {
    if (row.length > LEAF_SIDE) throw new PatternError('a macrocell leaf row is eight cells wide');
    for (let x = 0; x < row.length; x++) {
      const character = row[x];
      if (character === '*') cells[y * LEAF_SIDE + x] = 1;
      else if (character !== '.') {
        throw new PatternError(`'${character}' is not a macrocell cell`);
      }
    }
  });
  return { level: LEAF_LEVEL, cells };
}

function cellsOf(nodes: Node[], id: number, memo: Map<number, Uint8Array>): Uint8Array {
  const cached = memo.get(id);
  if (cached !== undefined) return cached;
  const node = nodes[id - 1];
  if (node === undefined) throw new PatternError(`node ${id} does not exist`);
  if (node.cells !== undefined) {
    memo.set(id, node.cells);
    return node.cells;
  }
  if (node.quads === undefined) throw new PatternError(`node ${id} has neither cells nor children`);
  const side = Math.pow(2, node.level);
  const half = side / 2;
  const out = new Uint8Array(side * side);
  const corners: Array<[number, number, number]> = [
    [node.quads[0], 0, 0],
    [node.quads[1], half, 0],
    [node.quads[2], 0, half],
    [node.quads[3], half, half],
  ];
  for (const [child, offsetX, offsetY] of corners) {
    if (child === 0) continue;
    const childNode = nodes[child - 1];
    if (childNode === undefined) throw new PatternError(`node ${child} does not exist`);
    if (childNode.level !== node.level - 1) {
      throw new PatternError(`node ${child} is not the size a quadrant of node ${id} needs`);
    }
    const sub = cellsOf(nodes, child, memo);
    for (let y = 0; y < half; y++) {
      out.set(sub.subarray(y * half, y * half + half), (offsetY + y) * side + offsetX);
    }
  }
  memo.set(id, out);
  return out;
}

/** Trim a square grid to the bounding box of its live cells. */
function trim(side: number, cells: Uint8Array, rule: string | null, generation: number | null): Pattern {
  let minX = side;
  let minY = side;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      if (cells[y * side + x] === 1) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    return { width: 1, height: 1, cells: new Uint8Array(1), rule, format: 'macrocell', generation };
  }
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    out.set(cells.subarray((minY + y) * side + minX, (minY + y) * side + minX + width), y * width);
  }
  return { width, height, cells: out, rule, format: 'macrocell', generation };
}

export function parseMacrocell(text: string): Pattern {
  const lines = text.split(/\r?\n/);
  let rule: string | null = null;
  let generation: number | null = null;
  let sawHeader = false;
  const nodes: Node[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') continue;
    if (line.startsWith('[M2]')) {
      sawHeader = true;
      continue;
    }
    if (!sawHeader) throw new PatternError('a macrocell file starts with a "[M2]" line');
    if (line.startsWith('#R')) {
      rule = line.slice(2).trim();
      continue;
    }
    if (line.startsWith('#G')) {
      const value = Number(line.slice(2).trim());
      if (!Number.isInteger(value) || value < 0) throw new PatternError(`'${line}' is not a generation`);
      generation = value;
      continue;
    }
    if (line.startsWith('#')) continue;

    const first = line[0];
    if (first === '.' || first === '*' || first === '$') {
      nodes.push(leaf(line));
      continue;
    }
    const parts = line.split(/\s+/).map(Number);
    if (parts.length !== 5 || parts.some((value) => !Number.isInteger(value))) {
      throw new PatternError(`'${line}' is neither a leaf nor a five-integer node`);
    }
    const [level = 0, nw = 0, ne = 0, sw = 0, se = 0] = parts;
    if (level < LEAF_LEVEL + 1) {
      throw new PatternError(`a two-state node has level 4 or more, not ${level}`);
    }
    for (const id of [nw, ne, sw, se]) {
      if (id < 0 || id > nodes.length) {
        throw new PatternError(`node ${id} is used before it is defined`);
      }
    }
    nodes.push({ level, quads: [nw, ne, sw, se] });
  }

  if (!sawHeader) throw new PatternError('a macrocell file starts with a "[M2]" line');
  const root = nodes[nodes.length - 1];
  if (root === undefined) throw new PatternError('the macrocell file holds no nodes');
  // A single leaf is a legal tree: an 8x8 universe written without any parent node.
  const side = Math.pow(2, root.level);
  if (!Number.isSafeInteger(side) || side > 1 << 16) {
    throw new PatternError(`a root of level ${root.level} is larger than this page can draw`);
  }
  const cells = cellsOf(nodes, nodes.length, new Map());
  return trim(side, cells, rule, generation);
}

/** Macrocell files start with `[M2]`; everything else is treated as RLE. */
export function looksLikeMacrocell(text: string): boolean {
  return text.trimStart().startsWith('[M2]');
}
