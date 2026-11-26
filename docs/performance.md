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

### Loading the metapixel array

`crates/ca-core/examples/macrocell_bench.rs`, run on 2026-11-25 with
`cargo run --release -p ca-core --example macrocell_bench`. The fixture is the generated
`site/public/fixtures/otcametapixel-array.mc` (1,740,165 bytes), 258,764 live cells in 6154×6154,
rule `B3/S23`, the page's node cap of 4,194,304. Three runs each, median reported.

| Path | Input handed to the loader | Wall time | Nodes | Arena and index |
|---|---|---|---|---|
| Macrocell | 1,699 KB of M2 text | 3,005 ms | 987,560 | 38 MB |
| Grid | 36 MB of cells | 2,517 ms | 987,560 | 38 MB |

Both rows build the same tree — the example asserts it on the array and the test suite pins it on
Golly's glider — so the comparison is the load, not the result. The macrocell reader is the slower
of the two at building it, by about a fifth: it reads the file's own quadtree, collects the cells and
rebuilds once at the level a step needs, where the grid loader inserts from a grid that is already
there.

What it buys is everything before that point. The grid row is timed from a 36 MB grid already in
memory; producing that grid is the page's own flattening step, which is JavaScript, allocates the
36 MB and is not in this table — the macrocell path has no such step at all. In the browser the
difference shows up as module memory: **69 MB** for the macrocell path against **102 MB** through the
grid, measured on the built module with one fresh instance per pattern, because wasm memory never
shrinks and a shared instance would report the peak of whatever ran first.

The load runs in a worker, so the seconds it takes block that thread rather than the page: the page
paints its shell, and the readout and the first window arrive as messages.

#### In the browser

Measured on the page's own clock, on the production build served by `vite preview` and loaded by
headless Chromium through Playwright: 1920×1080, no throttle, a quiet machine, three runs each in a
fresh browser context. The clock starts when the pattern select changes and stops when the status
line names the macrocell, so it covers the fixture fetch, the read, the readout and the first 640×640
window. The gun is already drawn, so the module is compiled before the clock starts.

| Path | Runs | Median | Longest main-thread block |
|---|---|---|---|
| Worker, one per load | 1.86 / 1.87 / 1.90 s | **1.87 s** | none over 50 ms |
| Worker, shared by every load | 1.47 / 1.48 / 1.62 s | **1.48 s** | none over 50 ms |
| Page's own thread | 1.41 / 1.44 / 1.77 s | **1.44 s** | 1.2-1.5 s |

The load costs about a second and a half wherever it runs, because what it costs is the reader and
the module's compile, not the thread: the page's own thread finishes in the same second and a half
and freezes for 1.2-1.5 s of it, which is the whole reason the worker is there. Sharing one worker
across loads takes a fifth off the load, 1.87 s to 1.48 s — a fresh worker compiles the module again,
and the page's second pattern should not have to pay for that.

A 36-cell gun, from a cold page to its status line, is 966 ms through a worker against 1,046 ms on
the page's thread (three runs each, medians): the same second, and most of it the module's compile
rather than anything about the pattern.

A second load of the same pattern is cheaper than the first, because the page keeps the file it
already has: at 1.6 Mbps and 150 ms of latency the array loads in 4,064 ms the first time and
1,819 ms once the text is in hand (medians of three runs; 7,478 / 4,064 / 3,862 and 1,819 / 2,226 /
1,715). What is left is the engine reading 1.7 MB of macrocell text — the download is the part a
cache can remove, and the tree is still built again from scratch.

The reader's 3.0 s above is a different measurement, a fresh module instance with its compile
included. In the browser the module is already compiled by the first pattern, so the array's load
adds less than the harness reports and the two figures are not each other's remainder.

#### On a throttled phone

The deployed build, loaded as a Pixel 7 with 4× CPU throttling, 1.6 Mbps and 150 ms of latency:
4.59 / 4.11 / 4.08 s, median **4.11 s**, with main-thread blocks up to 913 ms. Those blocks are the
page's own work — fetching and decoding 1.7 MB of macrocell text, and painting the first window —
not the engine, which stays in the worker. Three fresh contexts, the same clock as above.
