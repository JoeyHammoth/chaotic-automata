# Methods

Algorithms, constants and sources. A number without a citation is a placeholder and is marked as
such. Verification of the design document's claims is recorded in
[`research/design-doc-review.md`](research/design-doc-review.md).

## M1 · Atlas

### Rule families

**Life-like totalistic.** Rule = birth set `B ⊆ {0..8}` × survival set `S ⊆ {0..8}`, giving
`2^9 × 2^9 = 262,144` rules, which tile a 512×512 chart. Axes are Gray-coded, so adjacent columns
(birth mask) and rows (survival mask) differ by exactly one condition — this is what makes coastlines
geometrically meaningful rather than a display artefact.

`B0` rules (birth on zero neighbours) flicker the empty universe. The evaluation convention must be
fixed in implementation and documented here; the two-step transform is the default candidate.

**Lenia-lite.** Single-channel continuous CA on an `N×N` torus:

```text
U    = K * A                                   # normalised ring kernel, radius R
G(u) = 2·exp(-(u-μ)² / (2σ²)) - 1
A   ← clip(A + dt·G(U), 0, 1)
```

Chart axes are `(μ, σ)`; each pixel is a short run from a fixed seeded blob. Viable behaviour forms a
thin band — the continuous coastline.

**Probabilistic plane.** Domany–Kinzel `(p1, p2)` phase diagram, shown as an overlay.

### Metrics

| Metric | Definition | Note |
|---|---|---|
| Damage-spreading rate | twin replicas differing in one cell; fit growth rate of Hamming distance and front speeds | report the fraction of runs where damage died — chance resynchronisation inflates the rate |
| Lyapunov profile *(stretch)* | spatially resolved defect growth | unifies competing CA Lyapunov definitions |
| Transient length / period | Brent cycle detection on hashed states, cap `T_max` | hitting the cap yields **undecided** |
| Activity | fraction of cells changing over the last `W` steps | cheap order/chaos proxy |
| Block entropy | normalised Shannon entropy of 3×3 spatial and k-step temporal blocks | |
| Compression complexity | compressed/raw size of the spacetime diagram | algorithmic-complexity *proxy*; the codec is part of the definition |
| Localised-structure score | count and lifetime of components persisting after transient | detects gliders |
| Langton lambda | fraction of non-quiescent table entries | deliberately shown as the cautionary metric: the original edge-of-chaos reading did not survive re-examination |
| Embedding | vision-model embedding of a rollout filmstrip | offline; powers an alternative layout and similarity search |
| Undecided mass | fraction of runs hitting the budget cap | rendered as hatching |

Every metric carries a bootstrap interval over seeds. The **metric disagreement map** — pixels where
metric-derived classifications disagree — is a first-class layer, because it shows where "chaos" is a
definition-dependent label.

### The sample sweep, as implemented

`crates/ca-sweep` runs the §5.2 protocol per (rule, seed) and emits one JSON line;
`src/computation_atlas/sweep.py` aggregates across seeds (percentile bootstrap, 200 resamples),
classifies, and writes the binary products plus a manifest.

Budgets live in the profile, never in code that hides them:

| Profile | Region | Warm | Max steps | Period cap | Seeds |
|---|---|---|---|---|---|
| `golden` | 4×4, four windows | 8 | 40 | 120 | 11, 23 |
| `sample` | 32×32, four windows | 24 | 300 | 300 | 11, 23, 37, 53, 71, 97 |
| `atlas` | 512×512, whole chart | 4 | 40 | 40 | 11 |

The sample is four quadrants around the landmarks — Life `(15, 8)`, HighLife `(112, 8)`, Seeds
`(7, 0)`, Day & Night `(index_of(456), index_of(472))` in Gray-coded chart coordinates — because no
single 64×64 region contains all four. The product is a 64×64 tile with one quadrant per landmark, so
the output is itself a coarse chart of the same two axes.

What is actually computed:

- **Activity** — mean fraction of cells changing per observed step.
- **Block entropy** — normalised Shannon entropy of 3×3 spatial blocks over up to 8 sampled frames.
- **Temporal entropy** — normalised entropy of each cell's four-frame history over the same frames.
- **Compression complexity** — deflated size over raw size of the bit-packed spacetime diagram
  (deflate at the fast level; the codec is part of the definition, as the table warns).
- **Damage spreading** — twin replicas differing in one cell; growth over the first 16 observed steps,
  plus the fraction of seeds where the damage died.
- **Transient / period** — first repeat of a 64-bit state fingerprint; no repeat within
  `max_steps + period_cap` is `undecided`.
- **Langton lambda** — fraction of non-quiescent rule-table entries, kept as the cautionary metric.

Deferred, with reasons rather than silence: the localised-structure score (needs M2's particle
machinery, #19), the Lyapunov profile (marked stretch in the design), and embeddings (GPU job, §5.6,
not part of the sample).

Classification order, implemented once in `computation_atlas.metrics.classify`: cap hit → `undecided`;
period 1 with no activity → `static`; short period and low activity → `periodic`; damage dies in a
sparse field → `ordered`; high activity or entropy → `chaotic`; surviving damage in a moderately
entropic field → `complex`; otherwise `ordered`. The cap check is first, so a capped run is never
coloured chaotic (ADR 0003).

Per-seed generators are derived, not sampled from time: FNV-1a over the rule's chart position, a sweep
salt and the seed base, then folded to 32 bits.

### What the atlas ships

The map is drawn from `products/atlas/`: one fp16 layer per colouring (activity, spatial entropy,
compression, damage rate) plus a u8 `classes.bin` whose channels are the class code, the undecided flag
and a disagreement score. Class colouring uses the same tree as the sample, so the map and the published
numbers cannot disagree.

The disagreement score is the fraction of indicator pairs that differ across three cheap, independent
readings — damage survival (≥ 0.5 of seeds died → *ordered*), entropy level (≥ 0.5 → *chaotic*), and
whether the run resolved to a period ≤ 8 (*periodic*). Zero means all three agree; one means every pair
disagrees. It is a disagreement rate, not a confidence.

Undecided cells are hatched in every colouring, so "the cap was hit" never reads as a colour.

### The tile pyramid

The map is also pre-rendered: `src/computation_atlas/tiles.py` writes
`products/atlas/tiles/<colouring>/<level>/<x>_<y>.png` — six colourings (class, the four metrics and
disagreement) over three levels of 128 px tiles. Level 2 is one pixel per cell; each level above it is
the half-resolution parent, box-filtered from the level below, so undecided hatching averages into a
texture rather than disappearing.

The page therefore fetches the tiles for the window it is showing — 17 of them at 1:1, a handful when
zoomed in, a coarse parent first — instead of 2.8 MB of layers, and switching colouring fetches only
that colouring's tiles. The palette is written into the manifest by the pipeline and read back by the
page, so a legend cannot drift from the pixels it labels. `tests/test_tiles.py` rebuilds the committed
pyramid from the committed layers and fails if a single pixel differs (the version hashes pixels,
not deflate output), and a sweep writes its tiles in
the same run as its layers.

### Illumination

Filmstrip (≈8 frames, 64×64) per rule → vision embedding → 2D reduction (UMAP/PCA) for an alternative
layout, plus a compact vector (16–32 dims, fp16) for nearest-neighbour search. Text-to-rule search
uses a precomputed top-K per curated prompt; no text model ships to the browser. With no GPU, embed a
stratified subsample and propagate by k-NN, documenting the approximation. Method reference: ASAL,
[arXiv:2412.17799](https://arxiv.org/abs/2412.17799) (Artificial Life 31(3), 2025).

## M2 · Inspector

Scope: 1D binary CA of radius 1–2. 2D reconstruction is explicitly out of scope.

1. **Domains via epsilon-machine inference.** Causal states over spatial strings with bounded history
   `L = 3..8`, using CSSR or history clustering with a significance test.
2. **Domain filtering.** Run the inferred transducer over the field; mask domain-consistent cells,
   leaving particles and collisions.
3. **Local causal states.** For each cell, take past light cone depth `h` and future depth `f`; cluster
   cells whose future distributions are statistically equivalent. Local statistical complexity is the
   surprise of the inferred state: low in domains, high at particles. Method reference: Rupe &
   Crutchfield, [arXiv:1801.00515](https://arxiv.org/abs/1801.00515), Chaos **28**, 075312 (2018).
4. **Particle tracking.** Connected components → world-lines → velocity, period, collision table.
5. **Damage overlay.** Twin-replica difference field beside the spacetime diagram.

**Verified anchors.**

- Rule 90 reproduces Pascal's triangle mod 2 exactly — unit test against the binomial-coefficient
  parity.
- Rule 18 has a single regular domain `(0Σ)*`: every other site is zero, the rest free. It is a
  *domain* in the literature's sense — an invariant set of configurations, recovered as regions
  separated by walls — not a pattern that holds at one phase across a whole row. Reproduced; the
  measurement is under "As implemented". Sources: Wolfram, *Rev. Mod. Phys.* **55**, 601 (1983);
  Hanson & Crutchfield, *Physica D* **103**, 169 (1997); Cenek, dissertation (2011).
- Rule 110: ether plus gliders; exact spatial/temporal periods must be taken from Cook (2004) before
  being hard-coded as golden values. **Not yet verified** — placeholder.
- Rule 30: labelled "no known domain decomposition". Do not invent one.

### As implemented

`src/computation_atlas/inspector.py` ships the analytic half only: no UI, no product. Its scope is
narrower than the list above, and it says so at every entry point.

**Domain inference is a periodic-background finder, not CSSR.** A candidate is a period `p` (up to 8)
and a pattern whose fixed offsets hold one value in every row of the observed window, after an 8-row
settle. At least 1/8 of each period must be fixed and at least 1/8 of the window observed. The
invariant is then re-checked independently by `domain_violations`, which re-reads every fixed cell of
every observed row; a nonzero count is a bug, not a tolerance. A rule that does not satisfy it
exactly gets `None`, never a best guess.

Measured on a 128-cell torus over 96 observed rows, from a seeded 50% row (seed 11):

| Rules | Result |
|---|---|
| 0, 8, 32, 40, 64, 96, 128, 136, 160, 192 | `(0)*`, coverage 1.0: the field resolves to the quiescent state |
| 36, 164 | `(0 Sigma Sigma 0)*`, coverage 0.5, zero violations |
| 18 | `None` |
| 30 | `None`, and the report says "no known domain decomposition" |

**Rule 18's `(0 Sigma)*` is a domain, and it is reproduced once it is read as one.** An earlier
version of this section reported a contradiction: the periodic finder returns `None` for rule 18, so
the anchor looked wrong. It was the instrument. In the literature the phrase describes an *invariant
set* of spatial configurations — cells where every other site is zero, the remainder free — and a
rule-18 row is a concatenation of such regions in either phase, separated by walls that move,
annihilate in pairs and perform a random walk [Wolfram, *Rev. Mod. Phys.* **55**, 601 (1983);
Hanson & Crutchfield, *Physica D* **103**, 169 (1997); Cenek, dissertation (2011)]. A detector that
demands one phase at every offset of every row asks for something the literature never claimed.

`infer_phase_domain` tiles each row with both phases, minimising violations first and walls second,
and accepts a window only when no forced cell is broken and the worst row spends at most 1/8 of its
width on walls. Measured over 249 observed rows (seed 11, 8-row settle):

| Rule | Walls/row at 128 / 256 | Worst row | Violations | Read as |
|---|---|---|---|---|
| 18 | 3.08 / 6.12 | 7.8% | 0 | `(0 Sigma)*` regions around a wall gas |
| 36, 164 | 4.00 / 8.00 | 3.1% | 0 | domain agreed by both detectors |
| 30 | 42.00 / 86.21 | 45.3% | 0 | no domain: a third of the row is wall |
| 54, 22 | 37.46 / 73.97, 32.80 / 66.06 | 43.0% | 0 | no domain |
| 0 | 0.00 / 0.00 | 0.0% | 0 | quiescent |

Zero violations is not a decomposition on its own: the tiling can wall off everything, which is
exactly what rule 30 does. The wall budget is what separates a domain with particles in it from no
domain at all — rules 18, 36 and 164 need 1.8-7.8% of a row, while rules 30, 54 and 22 need 26-45%.

The walls thin with time, as an annihilating gas should: over ten seeds at 256 cells, 14.8 walls per
row at `t = 16`, 8.8 at 64, 6.6 at 128, 4.2 at 256.

**The spatial epsilon-machine learns the mixture, not the domain.** `spatial_machine` clusters
spatial histories of bounded length by the distribution of the next symbol, merging with a G-test at
`alpha = 0.01` and leaving histories seen fewer than 64 times undecided. On rule 18's whole attractor
at `L = 4` it reports 5 states, which is the right answer for a field that is two phases plus walls;
on rule 30 it reports 2. On a row drawn from an exact `(0 1)*` language the same code reports 2
states and a 2-symbol cycle, which is the check that the inference works when the field really is a
single deterministic domain. Counts are reported per seed rather than once: rule 18 gives
5,5,5,5,5,5,7,7,5,5 over ten seeds (interval 5.0-5.8), the finite-data spread a single run hides.

**The panel ships a product, not a live inference.** `python -m computation_atlas.panel` writes
`products/inspector/panel.json` for rules 18, 30 and 36 at 128 x 96 with the seed inside the
document; the page decodes it and nothing else. Bits travel as base64 of packed rows (low bit first,
padded per row) and complexities as one byte per cell, both stated in the file's own `encodings`
block. The fourth pane is the twin-replica difference: the same rule from the same row with one cell
flipped, differenced row by row. The residue pane is the domain's *unexplained* part — for a periodic
domain the cells the pattern does not explain, for a region domain the wall columns — and it is
`null`, with a sentence saying so, when there is no domain: rule 30 shows an empty pane and no
particle list rather than an invented one.

**Particles need a domain to exist first.** Connected components of an unfiltered field are the
chaotic sea: rule 30's raw field is one component 256 rows tall. A `Report` therefore reports tracks
(lifetime and drift) only when it also has a domain to filter with, and reports none otherwise.
Spatial periods and the collision table are #50.

**The Rule 90 oracle fixes its own geometry.** One cell on a 65-cell torus for 32 steps: cell `d` at
time `t` is `C(t, (t+d)/2) mod 2` when `t+d` is even, and zero otherwise. A random row would test
nothing: from 50% soup on a 256-cell torus, rule 90's density reaches zero within 128 steps.

**Local causal states** cluster each cell's past lightcone (depth 2) by the distribution it induces
over the next row, merging classes with a G-test at `alpha = 0.01`. Cells observed fewer than 8
times get state `-1` and are counted as `undecided`, never assigned to a state.

**Particles are chained per-row blobs, not connected components.** A component merges everything that
ever touches, which erases exactly the collisions this module exists to report. Each row's maximal
runs are linked to the next row by mutual nearest centre within 1.5 cells; a 1:1 link continues a
track, two or more sources merging into one blob is recorded as a merge, and one blob producing two
or more continuations is a split. Periods are measured, not assumed: the smallest `(time, space)` for
which the track's cell set repeats exactly, searched up to 32 rows. No repetition within the cap is
`period = None` — undecided, never a period of one.

**Null calibration, with the statistic named.** The statistic is `particle_count`: tracks of lifetime
at least 8 rows whose period was measured. Over 20 seeds, at 96 cells by 64 rows:

| Rule | Real mean | Null mean | Nulls reaching the real mean | Verdict |
|---|---|---|---|---|
| 18 | 22.85 | 3.40 | 0 of 20 | separates, passes at `alpha = 0.05` |
| 30 | 3.95 | 0.95 | 0 of 20 | separates, passes — informational only, rule 30 has no particle claim |
| 36 | 3.70 | 4.55 | 15 of 20 | **does not separate**, reported as no particle claim |

The false-positive rate is a permutation test on counts. "Any track at all" was tried first and
rejected: on a field with real density, shuffled rows still contain blobs, so it scored 20 of 20 and
meant nothing. Rule 36 is the useful negative control — it has a domain and plenty of tracks, and
still earns no particle claim, which is the behaviour ADR 0003 asks for.

**Complexity-state counts carry a bootstrap interval over seeds** (percentile, 200 resamples, the
same routine the atlas uses), so a state count is quoted with its spread rather than as a bare
integer.

## M3 · HashLife

A level-`k` node covers `2^k × 2^k` cells, stores four children, a population count and a cached
`result`: the centre `2^(k-1)` square advanced `2^(k-2)` generations. Canonical hash-consing means
each distinct subpattern is computed once.

- Variable time step: advance `2^j` generations at once, with the step size shown.
- Level-of-detail rendering: a node smaller than a pixel renders as population density.
- Tree view: sharing ratio (nodes vs nominal cells).
- Rule-agnostic leaf table (4×4) so other Life-like rules run, and the atlas can launch a rule here.
- Import RLE and macrocell; curated library of gun, breeder and metapixel array.

**Validation.** Differential against the naive stepper on random soups and standard patterns; golden
generations from Golly captured as fixtures (Golly is GPL-2.0-or-later and is used only as a
black-box oracle); property tests for canonicalisation, population conservation and glider
translation. The OTCA metapixel is a 2058×2058 pattern emulating one cell — confirm the current
dimensions on LifeWiki when importing it.

**Memory.** Arena allocation with generation-based GC, a hard node cap, and a visible memory gauge.
Chaotic soups are the honest benchmark: HashLife degrades to near-naive speed there.

## M4 · Stress Lab

**Toom's rule (NEC majority).** A cell takes the majority of itself, its north and east neighbours;
perturb each cell with probability ε. Toom's 1974 result: the stored bit survives for a
thermodynamically long time below a threshold. Contrast with symmetric majority, which loses it.
Confirmed formulation in Gács's exposition and Toom's own review
([arXiv:2306.13226](https://arxiv.org/abs/2306.13226)).

**Domany–Kinzel.** 1D probabilistic CA on `(p1, p2)`; the critical line separates active from
absorbing phases. At the `(1+1)`-dimensional directed-percolation point the density decays as
`ρ(t) ~ t^(-δ)` with `δ = 0.159464(6)`, alongside `β = 0.276486(8)` and `ν∥ = 1.733847(6)`. The design
document's "about 0.16" is correct to two significant figures. Fit with finite-size tolerance and
publish the system sizes.

**Hierarchical error correction (pedagogical).** Concatenated-majority tower: blocks encode
higher-level cells, which are blocked again. Labelled as an analogue of Gács's construction, not the
construction itself.

**Noise overlay.** Re-colour the atlas by structure survival at temperature ε.

**Frontier context (cited, not implemented).** Gács (1986, 1989) built reliable 1D computation from
hierarchical self-simulation. A local automaton for the 2D toric code
([arXiv:2412.19803](https://arxiv.org/abs/2412.19803), Quantum **10**, 2125, 2026) applies the
Tsirelson/Gács lineage to quantum error correction, and a 2026 dissipative QCA
([arXiv:2601.20818](https://arxiv.org/abs/2601.20818)) gives passive quantum error correction and
computation in two dimensions. The app explains how the classical idea scales; it implements neither.

## M5a · Forge

Reference: Miotti, Niklasson, Randazzo, Mordvintsev,
[arXiv:2506.04912](https://arxiv.org/abs/2506.04912) (ISAL 2025, doi:10.1162/ISAL.a.882). Each gate
holds a distribution over the 16 two-input Boolean functions during training, is relaxed for
gradients, and is hardened to a pure Boolean circuit at inference.

Offline training with JAX/CAX ([arXiv:2410.02651](https://arxiv.org/abs/2410.02651), ICLR 2025; MIT
licensed, speed-ups up to 2,000×) or PyTorch. Export hardened circuits as JSON: gate list, wiring,
channel layout. In the browser: circuit DAG viewer, bit-sliced execution, damage/asynchrony controls,
gate-pruning view.

**Validation.** Hardened output matches the training-time hard forward pass exactly; the Life-recovery
circuit matches `B3/S23` on all 512 neighbourhood configurations.

## M5b · Verifier

Reference: the bbchallenge Collaboration, *Determination of the fifth Busy Beaver value*,
[arXiv:2509.12337](https://arxiv.org/abs/2509.12337) — `S(5) = 47,176,870` proved in Coq (now Rocq),
enumerating 181,385,789 machines; STOC 2026, doi:10.1145/3798129.3806376.

Pipeline: untrusted deciders (cycler, translated cycler, bouncer) emit certificates; a minimal
checker validates by independent replay and shares no code with the deciders. Outcome classes:
`halts (n steps)`, `certified non-halting`, `heuristically non-halting`, `undecided` — the last two
are never collapsed.

**Validation.** `S(2)=6`, `S(3)=21`, `S(4)=107` by exhaustive search; the BB(5) champion halts after
47,176,870 steps; certificates pass the checker on a labelled set and fail on mutated certificates.
Machine strings are taken from the bbchallenge wiki and checked there before use — the Antihydra
string quoted in the design document is unverified and must be confirmed.

## M7 · Heritage

The original sandpile lab's least-squares fit on raw counts is biased by the tail floor at count 1
(the flat line at `10^0`). Replace it with log-binned histograms, maximum-likelihood power-law fits
with goodness-of-fit, finite-size-scaling collapse and bootstrap intervals, and show the two fits
side by side.
