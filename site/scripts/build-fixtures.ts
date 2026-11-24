// The metapixel array is derived, not published: `spread` lays the four copies one 4096-square
// apart, which is what lets the quadtree share them, and `writeMacrocell` writes that layout as an
// M2 file. Generating it here keeps the published RLE the only source of truth, and keeps three
// megabytes of derived text out of the repository.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeMacrocell } from '../src/hashlife/lib/macrocell';
import { parseRle, spread } from '../src/hashlife/lib/rle';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '..', 'public', 'fixtures');

const metapixel = parseRle(readFileSync(resolve(fixtures, 'otcametapixel.rle'), 'utf8'));
const array = spread(metapixel, 2, 2);
const text = writeMacrocell(array, 0);
writeFileSync(resolve(fixtures, 'otcametapixel-array.mc'), text);
console.log(
  `wrote otcametapixel-array.mc: ${array.width}x${array.height}, ` +
    `${(text.length / 1e6).toFixed(1)} MB`,
);
