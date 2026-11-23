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
the same Lighthouse version against the production build on every push and pull request, and fails
below 95. It also fails a report that scored too few audits to mean anything, because a page that
never boots scores 100 for having nothing to object to.

Measured on 2026-11-23, the budget is a threshold rather than a zero-failure rule, and the
difference matters. Removing `lang` from `index.html` — a weight-7 audit — scores **96** and
**passes**; removing `lang` and the `<title>` together scores **92** and fails. A removed `<main>`
landmark is not caught at all, because Lighthouse 13.6.0 does not score the landmark audits. The
gate therefore catches regressions worth more than its 5-point margin and tolerates a single serious
defect inside it. Both runs are recorded on #53.

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
local server in CI, and the `a11y` job does the same for accessibility, so a regression larger than
the budget's 5-point margin fails the build before it reaches this page. This document is the record of the deployed artefact, which CI
cannot observe.
