# Limitations

What this project does not claim, cannot show, or shows only approximately. This page is part of the
deliverable, not an apology.

## Scope

- **1D only in the Inspector.** Domain and particle decomposition is implemented for radius 1–2
  binary 1D rules. Local causal state inference in 2D is out of scope; anything 2D is shown as raw
  evolution, never as an inferred decomposition.
- **Two rule families are exhaustive; the rest are samples.** Life-like rules are enumerated
  completely (262,144). Lenia-lite is explored on a parameter plane, not exhaustively.
- **One signature module.** Forge or Verifier, chosen explicitly; the other remains a documented
  option. Neither is a new research result.
- **The hierarchical error-correction visualiser is a pedagogical analogue.** It is not Gács's
  construction, and it does not demonstrate a threshold.

## Measurement

- **Cap-hitting runs are undecided.** Cycle detection and machine simulation stop at a budget. The
  undecided fraction is displayed, not hidden.
- **Critical exponents are finite-size-sensitive.** The directed-percolation decay exponent is fitted
  with error bars and stated lattice sizes; a fit that misses `δ ≈ 0.1595` within tolerance is
  reported as a miss.
- **"Compression complexity" is a proxy, not Kolmogorov complexity.** It depends on the codec, and the
  codec is named wherever the number is shown.
- **Damage-spreading rates can be inflated by chance resynchronisation.** The fraction of runs where
  damage dies is reported alongside the rate.
- **The performance numbers come from headless Chrome, not a GPU laptop.** The deployed build is measured at 1080p with a 4× CPU throttle and a 4G profile; frame time is script and raster cost in software, so it is evidence about the render path rather than a promise about any particular integrated GPU. The largest-contentful-paint figure describes the header text, because a canvas is not an LCP candidate; the map's own readiness is timed separately.
- **Metric disagreement is the honest headline.** Where classifiers disagree, the map says so rather
  than choosing a winner.

## The 64×64 sample sweep

- **Small tori change the science.** On a 64×64 torus with 30% soup the landmarks measure
  0.07/0.07/0.42/0.03 activity
  (Life/HighLife/Seeds/Day & Night) and damage survives in most seeds
  (0.17/0.00/0.00/0.67 died). Those are finite-size
  numbers: the 512×512 sweep uses larger budgets and its values must not be read off the sample.
- **The sample is 3,296 unique rules, not 4,096.** The four landmark quadrants
  overlap, so 800 cells of the 64×64 tile repeat a rule measured elsewhere.
  The manifest states both numbers.
- **Budgets are modest on purpose.** 300 observed steps and a
  300-step period cap leave 2,606 of
  4,096 cells `undecided`. That is the honest answer to "did this run
  resolve?", not a claim that nothing is known about the rule.
- **The atlas product reports undecided mass.** `products/atlas` is 512×512 with 24 warm steps, 300
  observed steps, a 300-step period cap and six seeds per rule: the same budgets as the 64×64
  sample, so the map and the sample measure the same quantity and `damage_died_rate` is no longer
  sample-only. At these budgets **198,719 of the 262,144 rules (75.8%)** stay `undecided`: a longer
  budget moves the boundary, it does not reach a proof, and the manifest carries the fraction.
- **Four metrics are deferred, not approximated**: localised-structure score (needs M2 particles),
  Lyapunov profile (design stretch), damage front speeds (only the growth rate is measured) and
  embeddings (GPU job). `docs/methods.md` says so beside the metric table.

## Coverage and approximation

- **No rollouts are shipped.** Thumbnails are simulated on demand; the atlas is a map of measured
  behaviour, not of stored videos.
- **Embeddings may be subsampled.** Without a GPU, a stratified subsample is embedded and propagated
  by k-nearest neighbours. The approximation and its sample size are documented with the artefact.
- **Text-to-rule search is precomputed** for an enumerated prompt list. Free-text prompts are not
  embedded in the browser.
- **Browser capability varies.** Tiers change speed only; deterministic output must be identical. If a
  tier disagrees, that is a bug, not a limitation.

## Knowledge

- **Open questions are shown as open.** Rule 30 has no known domain decomposition; the BB(5) pipeline's
  remaining cryptids reduce to open mathematics. The app does not manufacture structure for them.
- **Published values are quoted, not re-proved.** BB(5) = 47,176,870 is cited from the bbchallenge
  formalisation; the app demonstrates the *method* (deciders, certificates, checker) and does not
  re-verify the Coq proof.
- **No new theorems.** The contribution is faithful, well-instrumented reimplementation plus a
  comparison result about metric disagreement.
- **Some cited constants are still placeholders.** Rule 110's ether periods, the OTCA metapixel
  dimensions and the Antihydra machine string are flagged in `docs/methods.md` until verified against
  the primary source.

## Data and privacy

No accounts, no analytics, no user data. Nothing a visitor does leaves the page.
