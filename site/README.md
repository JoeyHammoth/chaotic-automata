# Site

The browser application. Today it runs one rule from the URL (the M0 vertical slice); the atlas,
Inspector and HashLife land here as separate instruments.

## Layout

Each folder is a **deep module**: a small interface at the folder root, implementation hidden in
subfolders.

```text
src/
  engine/
    index.ts        entry point: Engine interface, createEngine, rule re-exports
    lib/            implementation (rule parsing, soup, cpu, wasm) — not imported from outside
    tests/          tests that import only ../index
  render/
    index.ts        entry point
    lib/grid.ts     canvas renderer
  state/
    index.ts        entry point
    lib/url.ts      URL parsing and serialisation
  main.ts           wiring: URL -> engine -> renderer
```

Rules: import a module through its entry point (`engine`, `render`, `state`), never through `lib/`.
Expose several small entry points rather than one barrel. Tests live in `tests/` and cross the same
seam a caller does.

## Commands

```bash
npm install
npm run dev          # http://127.0.0.1:5173
npm run build:wasm   # cargo build -p ca-wasm --target wasm32-unknown-unknown --release, copied to public/
npm run dev          # after build:wasm the WASM engine is used; otherwise the CPU reference is
npm run typecheck    # tsc --noEmit
npm test             # vitest
npm run e2e          # playwright (installs a browser the first time: npx playwright install chromium)
npm run build        # typecheck + production bundle
```

The engine tier is chosen at runtime and shown in the status line: `wasm` when `public/engine.wasm`
loads, `cpu` otherwise. Both satisfy `Engine`, and the differential tests in `crates/ca-core` keep them
honest (ADR 0002, ADR 0004).

## URL

`?rule=B3/S23&seed=1` (optional `size`, a multiple of 64 up to 512). The page canonicalises the rule
in the URL on load, so a link always names exactly one rule. Malformed input produces a visible
message rather than a blank canvas.
