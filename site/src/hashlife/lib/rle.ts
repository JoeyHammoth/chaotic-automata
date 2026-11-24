// RLE import. The format is a header line, then runs: a count and a tag, where `b` is dead, `o` is
// alive, `$` ends a row and `!` ends the pattern. Comments start with `#`.
//
// The parser returns a dense grid rather than a cell list because the wasm loader takes a grid: one
// copy into the module's memory, and nothing is re-derived in the browser.

export interface Pattern {
  width: number;
  height: number;
  /** Row-major, one byte per cell: 1 alive, 0 dead. */
  cells: Uint8Array;
  /** The rule the pattern asks for, if it names one. */
  rule: string | null;
  /** The format it was read from, so the page can say where a pattern came from. */
  format: 'rle' | 'macrocell';
  /** The generation the file was saved at, when it records one. */
  generation: number | null;
}

export class PatternError extends Error {}

const HEADER = /x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)(?:\s*,\s*rule\s*=\s*([A-Za-z0-9/]+))?/;

export function parseRle(text: string): Pattern {
  const lines = text.split(/\r?\n/);
  let header: RegExpMatchArray | null = null;
  const body: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (header === null && HEADER.test(trimmed)) {
      header = trimmed.match(HEADER);
      continue;
    }
    body.push(trimmed);
  }
  if (header === null) throw new PatternError('the pattern has no "x = …, y = …" header');
  const width = Number(header[1]);
  const height = Number(header[2]);
  const rule = header[3] ?? null;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new PatternError(`the header declares a ${width}x${height} pattern`);
  }

  const cells = new Uint8Array(width * height);
  let x = 0;
  let y = 0;
  let count = 0;
  let sawEnd = false;
  const runs = body.join('');
  for (const character of runs) {
    if (character >= '0' && character <= '9') {
      count = count * 10 + Number(character);
      continue;
    }
    const repeat = count === 0 ? 1 : count;
    count = 0;
    if (character === '!') {
      sawEnd = true;
      break;
    }
    if (character === 'b' || character === 'o') {
      if (y >= height) throw new PatternError('the pattern runs past the declared height');
      if (x + repeat > width) throw new PatternError(`row ${y} runs past the declared width`);
      if (character === 'o') cells.fill(1, y * width + x, y * width + x + repeat);
      x += repeat;
      continue;
    }
    if (character === '$') {
      y += repeat;
      x = 0;
      if (y > height) throw new PatternError('the pattern runs past the declared height');
      continue;
    }
    if (character === '\n' || character === ' ' || character === '\t') continue;
    throw new PatternError(`'${character}' is not an RLE tag`);
  }
  if (!sawEnd) throw new PatternError('the pattern does not end with "!"');
  if (y > height) throw new PatternError('the pattern runs past the declared height');
  return { width, height, cells, rule, format: 'rle', generation: null };
}

/** Live cells as `[x, y]` pairs, for a test or a caption. */
export function liveCells(pattern: Pattern): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < pattern.height; y++) {
    for (let x = 0; x < pattern.width; x++) {
      if (pattern.cells[y * pattern.width + x] === 1) out.push([x, y]);
    }
  }
  return out;
}

/**
 * Repeat a pattern in a grid of copies: a metapixel array is exactly this, and the tiling is done
 * here rather than in a fixture file so the source pattern stays the one that was published.
 */
export function tile(pattern: Pattern, columns: number, rows: number): Pattern {
  if (columns < 1 || rows < 1) throw new PatternError('a tiling needs at least one copy');
  const width = pattern.width * columns;
  const height = pattern.height * rows;
  const cells = new Uint8Array(width * height);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      for (let y = 0; y < pattern.height; y++) {
        const from = y * pattern.width;
        const to = (row * pattern.height + y) * width + column * pattern.width;
        cells.set(pattern.cells.subarray(from, from + pattern.width), to);
      }
    }
  }
  return { ...pattern, width, height, cells };
}

export function nextPowerOfTwo(value: number): number {
  let power = 1;
  while (power < value) power *= 2;
  return power;
}

/**
 * Repeat a pattern on a power-of-two grid, one copy per square.
 *
 * This is what makes a metapixel array affordable. Copies placed edge to edge sit at different
 * phases of the quadtree — 2058 is not a power of two — so no subtree is ever equal and the tree
 * costs four times a single copy. Placed at a power-of-two spacing, every copy is the same subtree
 * and the tree shares them: four metapixels then cost one metapixel plus a handful of nodes.
 */
export function spread(pattern: Pattern, columns: number, rows: number): Pattern {
  if (columns < 1 || rows < 1) throw new PatternError('a tiling needs at least one copy');
  const spacing = nextPowerOfTwo(Math.max(pattern.width, pattern.height));
  const width = (columns - 1) * spacing + pattern.width;
  const height = (rows - 1) * spacing + pattern.height;
  const cells = new Uint8Array(width * height);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      for (let y = 0; y < pattern.height; y++) {
        const from = y * pattern.width;
        const to = (row * spacing + y) * width + column * spacing;
        cells.set(pattern.cells.subarray(from, from + pattern.width), to);
      }
    }
  }
  return { ...pattern, width, height, cells };
}

export function population(pattern: Pattern): number {
  let total = 0;
  for (const cell of pattern.cells) total += cell;
  return total;
}
