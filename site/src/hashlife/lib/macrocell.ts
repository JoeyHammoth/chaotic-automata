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

/**
 * Write a pattern as a Golly macrocell (M2).
 *
 * There is no interning: every non-empty node is emitted once, children before parents, so the file
 * is proportional to the live cells rather than to the square they sit in. That keeps the writer
 * small enough to trust, and the round-trip against a published RLE is what tests the pair.
 *
 * The published metapixel macrocell is not reachable from here — conwaylife.com refuses automated
 * fetches and no mirror carries the `.mc` — so this writer is how the macrocell path gets a large
 * pattern to read. It is our export, not Golly's, and the test says so by comparing cell for cell
 * against the published RLE.
 */
export function writeMacrocell(pattern: Pattern, generation = 0): string {
  const rule = pattern.rule ?? 'B3/S23';
  let level = LEAF_LEVEL;
  while (2 ** level < Math.max(pattern.width, pattern.height)) level += 1;
  const side = 2 ** level;
  const lines: string[] = [];
  let next = 1;

  const per = side / LEAF_SIDE;
  const leaves = new Int32Array(per * per);
  for (let by = 0; by < per; by++) {
    for (let bx = 0; bx < per; bx++) {
      const rows: string[] = [];
      let live = false;
      for (let y = 0; y < LEAF_SIDE; y++) {
        let row = '';
        for (let x = 0; x < LEAF_SIDE; x++) {
          const px = bx * LEAF_SIDE + x;
          const py = by * LEAF_SIDE + y;
          const on =
            px < pattern.width &&
            py < pattern.height &&
            pattern.cells[py * pattern.width + px] === 1;
          if (on) live = true;
          row += on ? '*' : '.';
        }
        rows.push(row.replace(/\.+$/, ''));
      }
      if (!live) continue;
      while (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();
      leaves[by * per + bx] = next++;
      lines.push(rows.map((row) => `${row}$`).join(''));
    }
  }
  if (lines.length === 0) throw new PatternError('a macrocell needs at least one live cell');

  const rings: Int32Array[] = [leaves];
  let size = per;
  let nodeLevel = LEAF_LEVEL;
  while (size > 1) {
    nodeLevel += 1;
    const half = size / 2;
    const parents = new Int32Array(half * half);
    const previous = rings[rings.length - 1] as Int32Array;
    for (let by = 0; by < half; by++) {
      for (let bx = 0; bx < half; bx++) {
        const nw = previous[by * 2 * size + bx * 2] ?? 0;
        const ne = previous[by * 2 * size + bx * 2 + 1] ?? 0;
        const sw = previous[(by * 2 + 1) * size + bx * 2] ?? 0;
        const se = previous[(by * 2 + 1) * size + bx * 2 + 1] ?? 0;
        if (nw === 0 && ne === 0 && sw === 0 && se === 0) continue;
        parents[by * half + bx] = next++;
        lines.push(`${nodeLevel} ${nw} ${ne} ${sw} ${se}`);
      }
    }
    rings.push(parents);
    size = half;
  }

  return [`[M2] (golly 2.0)`, `#R ${rule}`, `#G ${generation}`, ...lines].join('\n') + '\n';
}
