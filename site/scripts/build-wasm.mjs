// Build the engine for wasm32 and copy it into public/ so the site can fetch it.
// A missing Rust toolchain is not fatal locally (the site falls back to the CPU reference),
// but it is fatal in CI, where a silent fallback would hide a broken build.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const wasmPath = join(
  repoRoot,
  'target',
  'wasm32-unknown-unknown',
  'release',
  'ca_wasm.wasm',
);
const publicDir = join(here, '..', 'public');
const destination = join(publicDir, 'engine.wasm');

const cargo = spawnSync('cargo', ['--version'], { stdio: 'ignore' });
if (cargo.status !== 0) {
  const message = 'cargo is not available; skipping the wasm build (site will use the CPU reference)';
  if (process.env.CI) {
    console.error(`error: ${message}`);
    process.exit(1);
  }
  console.warn(`warning: ${message}`);
  process.exit(0);
}

const build = spawnSync(
  'cargo',
  ['build', '-p', 'ca-wasm', '--target', 'wasm32-unknown-unknown', '--release'],
  { cwd: repoRoot, stdio: 'inherit' },
);
if (build.status !== 0) process.exit(build.status ?? 1);

if (!existsSync(wasmPath)) {
  console.error(`error: expected ${wasmPath} to exist after the build`);
  process.exit(1);
}

mkdirSync(publicDir, { recursive: true });
copyFileSync(wasmPath, destination);
console.log(`copied ${wasmPath} -> ${destination}`);
