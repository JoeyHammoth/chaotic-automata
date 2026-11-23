# Performance

The M1 exit criterion puts numbers on things that are not features: the atlas must load within
2.5 s LCP, pan/zoom within 16.7 ms per frame, and score at least 95 on Lighthouse accessibility.
This page records all three, taken from the deployed build rather than a dev server, and states
what the numbers cover.

## Measured

Deployed at <https://joeyhammoth.github.io/chaotic-automata/>, built from `73afb26` (PR #38) by
`.github/workflows/pages.yml`, measured on 2026-11-18.

| Budget (design doc §8.1) | Target | Measured | Verdict |
|---|---|---|---|
| Largest contentful paint | ≤ 2.5 s | **0.95 s** (runs 0.62 / 0.95 / 1.01 s) | pass |
| Pan frame time, 95th percentile | ≤ 16.7 ms | **7.2 ms** (median 6.9 ms) | pass |
| First-load transfer, compressed | ≤ 2 MB | **0.10 MB** | pass |
| Map painted, no tiles pending | not budgeted | 1.8 s | reported |
| Lighthouse accessibility | ≥ 95 | **100** | pass |

Three cold runs, each in a fresh browser context, reporting the median.

## What "LCP" does and does not describe

The largest contentful paint on this page is the header text, not the map: a `<canvas>` is not an
LCP candidate, so no LCP figure can ever describe when the atlas itself is visible. The observer
therefore reports when the page's largest *eligible* element painted (0.95 s), while the map's own
readiness — painted, and no tiles still in flight — is timed separately at 1.8 s.

Both are inside the 2.5 s budget, and the second one is the number the exit criterion actually
cares about. The map figure is the stricter of the two and is the one to watch if the page grows.

## Conditions

- **LCP, transfer and readiness:** 1920×1080 viewport, cold cache, 4× CPU throttle, 4G emulation
  (150 ms RTT, 9 Mbps down), against the public URL including its CDN.
- **Frame time:** the same page and a one-second scripted pointer drag across the map at zoom 1,
  sampling `requestAnimationFrame` intervals, with the CPU throttle lifted. The design document
  specifies this budget at 1080p on integrated graphics; the throttle applies to LCP, not frame time.
- **Scene:** the `class` colouring at zoom 1.00×, 21 tiles resident, 512×512 chart.

## Accessibility

Lighthouse 13.6.0 scores the deployed page **100 / 100** over 24 audited checks, against the
≥ 95 target. Nothing sat below the bar, so nothing was changed to reach it.

The audited surface is the document: title and language, a single main landmark, heading order,
the labelled controls and buttons, the live regions, and text contrast. That is what a rule-based
audit can read.

What it cannot read is the map itself. It does not know whether two colours in the `class` layer
are distinguishable, whether the hatch reads as "undecided" rather than as one more colour, or
whether the legend swatches match the pixels beside them. Those stay judgement calls, and the
palette and legend being written into one manifest is the protection the tool cannot provide. The
map is also `role="application"`, which hands arrow and zoom keys to the app; the audit confirms
the label promising that exists, not that the interaction is usable by ear.

The score is gated rather than merely recorded: the `a11y` job in `.github/workflows/ci.yml` runs
the same Lighthouse version against the production build on every push and pull request, fails on
any scored audit that fails, and fails below 95. It also fails a report that scored too few audits
to mean anything, because a page that never boots scores 100 for having nothing to object to.

A score is a weighted sum, and a sum absorbs a small defect, so the gate does not rely on the
threshold alone. Measured on 2026-11-23, removing `lang` from `index.html` — a weight-7 audit —
scored **96** and passed; removing `lang` and the `<title>` together scored **92** and failed. A
removed `<main>` was worse: `landmark-one-main` weighs 3, which on a page whose scored weights sum
to a few hundred points is about one point of score, so the landmark could disappear without the
budget noticing. The audit is scored rather than skipped — probed on 2026-11-24 against the pinned
Lighthouse 13.6.0, a page with `<main>` scores it 1 and the same page without one scores it 0,
taking the category from 1.00 to 0.93 over a 44-point weight sum — so the gate now names every
failing audit and fails on it, with the threshold kept behind that as a backstop for a regression
spread thinly across many audits. The earlier runs are recorded on #53 and the landmark case on
#65.

## What these numbers do not show

- **No GPU was involved.** The measurement ran in headless Chrome, which rasterises in software, so
  7.2 ms is script plus raster cost on one CPU core. It is evidence that the render path is cheap
  enough to leave the budget alone; it is not a promise about any particular integrated GPU. The
  cadence observed (139–144 frames/s) means the renderer was not the limiter during the pan.
- **Only a steady-state pan was timed**, not the LOD switch when a zoom crosses a tile level, not a
  full zoom-out, and not the rule canvas animating alongside the map.
- **One machine, one browser.** No mobile viewport, no low-end device, no Firefox or Safari.
- **The accessibility score is one automated pass, not a user test.** It was run once, at
  Lighthouse's mobile viewport, and validates markup; the map's colours and its
  `role="application"` interaction remain untested with assistive technology.

The committed e2e suite (`site/e2e/atlas.spec.ts`) asserts the LCP and frame budgets against a
local server in CI, and the `a11y` job does the same for accessibility, so a regression that fails
any scored audit fails the build before it reaches this page. This document is the record of the deployed artefact, which CI
cannot observe.

## HashLife (M3)

`crates/ca-core/examples/hashlife_bench.rs`, run on 2026-11-24 with
`cargo run --release -p ca-core --example hashlife_bench`. Rule `B3/S23`, node cap 5,000,000 (never
reached). Soups come from the committed `ca_core::seed::soup` at seed 12345 and 30% density, so a
run reproduces them exactly.

| Case | Generations | Wall time | µs/generation | Nodes | Population |
|---|---|---|---|---|---|
| Glider, 3×3 | 1,048,576 | 1.1 ms | 0.001 | 784 | 5 |
| Soup 64×64 | 64 | 38.9 ms | 608 | 36,367 | 537 |
| Soup 128×128 | 16 | 556 ms | 34,771 | 469,529 | 3,222 |
| Soup 256×256 | 4 | 1,315 ms | 328,827 | 745,144 | 17,177 |

The glider is the case the algorithm exists for: one compressed step covering `2^20` generations,
a millisecond, because every subtree in it repeats and is therefore shared.

The soups are the honest slow case, and the limit is the tree rather than the rule. A compressed
step returns the centre half of its root, so it is only usable when the whole pattern fits inside
that half; `step` walks the step size down until it does, and a 128-wide chaotic soup fits nothing
above a single generation. The engine therefore falls back to the sparse sweep — `O(cells)` per
generation, with a hash set per neighbourhood — which is near-naive, as the methods page predicts.
Only the 64×64 soup stays on the compressed path, and it does so at 608 µs per generation against
the glider's 0.001.

Node counts are the arena's size at the end of the run, not a peak. The sparse fallback rebuilds
the tree from the live cells each generation and leaves the superseded nodes in the arena until
`collect_garbage` runs, so the 256×256 row holds four generations of trees. That is what the cap and
the collection are for: the cap reports instead of silently exceeding, and a caller running a soup
for a long time is expected to collect between batches.

Conditions: 12th Gen Intel Core i7-12650H (16 logical cores, one used), 16 GB, Windows 11
(10.0.26200), rustc 1.100.0, release profile (`opt-level = 3`). Wall clock, including the root
rebuilds. These numbers are not comparable with the atlas numbers above, which were taken in a
browser under a throttled mobile profile.
