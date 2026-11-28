# Troubleshooting

Symptom first. Each entry says what you see, why it happens, and what to do. Where the answer is
"that is the intended result", it says so and points at the page that explains it.

If what you see is not here, open an issue with the page URL or the command and its output — see
[`SUPPORT.md`](../SUPPORT.md).

## The atlas says "Cannot load the atlas data: …"

The map reads `products/atlas/` — a manifest and its tiles — relative to the built site's base path,
and the message names what failed. Check in this order:

1. **The product is in the checkout.** `products/atlas/manifest.json` is committed. If it is missing,
   the clone is incomplete rather than the page broken.
2. **You are serving the build, not opening the file.** A `file://` page cannot fetch the tiles. Use
   `npm run dev` or `npm run preview` in `site/`.
3. **The base path matches where it is served.** GitHub Pages serves this project under
   `/chaotic-automata/`, so the Pages build sets `VITE_BASE=/chaotic-automata/`
   (`.github/workflows/pages.yml`). A production build without it asks for `/products/…` at the domain
   root and gets a 404.

## The map is hatched rather than coloured

Hatching is the `undecided` class, not a load failure and not "chaotic": the run hit its step or
period cap without resolving, and the fraction is reported rather than guessed. [`limitations.md`](limitations.md)
explains the budgets; [`methods.md`](methods.md) has the classifiers. Longer budgets move the
boundary; they do not turn it into a proof.

## The rule panel says `cpu` where you expected `wasm`

The status line under the live rule names the engine tier actually in use. `site/public/engine.wasm`
is generated, gitignored, and produced by:

```bash
cd site
npm run build:wasm
```

Without it the page falls back to the CPU reference engine. Both satisfy the same interface and are
checked against each other, so the tier changes speed, not results — a disagreement between tiers is a
bug, not a limitation.

## The Inspector says "Rule N is not in the panel product"

The panel is a committed product, not a live computation: `products/inspector/panel.json` ships rules
18, 30 and 36 at one window. The Inspector supports 1D binary rules of radius 1–2, but only rules in
that product have frames to show. Producing another rule is a pipeline command, not a page feature.

## A rule has no domain decomposition

Rule 30 is the documented case: it has no known domain decomposition, so the Inspector shows the raw
evolution and says there is nothing to decompose. The absence is the result — see
[`limitations.md`](limitations.md).

## The atlas map is narrower than the page

The map frame is square and centred because the chart is 512 × 512: a square frame shows every cell at
once, undistorted. The controls and the legend still use the full width.

## A URL parameter is rejected

The page refuses a parameter it cannot honour, with a visible message instead of a blank canvas. The
common ones:

| Message says | Means |
|---|---|
| `size` must be a multiple of 64 between 64 and 512 | `?size=` sets the live rule's torus, not the map |
| `z` must be between 0.5 and 32 | `?z=` is viewport pixels per chart cell |
| `x` and `y` must be chart coordinates in 0..512 | `?x=`/`?y=` are the chart coordinate at the top-left |

## A page works with `npm run dev` and 404s on Pages

The dev server serves every `.html` file it finds; `vite build` emits only the pages named in
`rollupOptions.input` in `site/vite.config.ts`. A new page must be added there.
`site/src/tests/build-entries.test.ts` fails when the two lists disagree, so `npm test` catches it
before the deploy does.

## The differential tests are skipped or fail with no engine

They compare the Rust engine against the Python reference and need the comparison binary built:

```bash
cargo build -p ca-diff --release
CA_DIFF_BIN=target/release/ca-diff pytest -m differential
```

`pytest -q` without that environment variable does not exercise them; CI builds the binary in its own
job. The same applies to the sweep tests and `ca-sweep`.

## `test_committed_panel_matches_its_generator` fails

The committed `products/inspector/panel.json` no longer matches a rebuild. The committed file is
stale, not the test. Regenerate it and commit the result:

```bash
pip install -e ".[dev]"
python -m computation_atlas.panel
pytest tests/test_panel.py -q
```

Do not edit a product by hand: each one carries the seed, budgets and pipeline version that produced
it, and hand editing breaks that provenance.
