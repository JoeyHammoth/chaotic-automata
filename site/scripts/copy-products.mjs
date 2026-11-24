// The site serves the pipeline's products verbatim; nothing is transformed on the way in, so a
// figure and the committed bytes cannot disagree.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const source = resolve(root, 'products');
const target = resolve(here, '..', 'public', 'products');

if (!existsSync(resolve(source, 'atlas', 'manifest.json'))) {
  console.error('products/atlas is missing; run `python -m computation_atlas.sweep --profile atlas`');
  process.exit(1);
}

mkdirSync(target, { recursive: true });
for (const name of ['atlas', 'sample', 'inspector', 'stress', 'noise']) {
  const from = resolve(source, name);
  if (existsSync(from)) cpSync(from, resolve(target, name), { recursive: true });
}
console.log(`copied products into ${target}`);
