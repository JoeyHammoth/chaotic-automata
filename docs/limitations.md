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
- **Metric disagreement is the honest headline.** Where classifiers disagree, the map says so rather
  than choosing a winner.

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
