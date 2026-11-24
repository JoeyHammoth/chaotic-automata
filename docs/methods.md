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
- Rule 110: the ether is `00010011011111`, 14 cells wide, and returns every 7 steps. Both are
  asserted against the ring of 14 in `tests/test_rule110.py`, and a random row reaches the ether
  inside the recorded window. The glider periods in Cook's Figure 5 are **not** reproduced here and
  must not be quoted as measured. Source: Cook, *Complex Systems* **15** (2004) 1–40, §3.1.
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

**The heatmap marks particles, and the measurement says by how much.** `state_separation` compares
mean local complexity on the kink mask — each tiling wall and its neighbours — with the mean
everywhere else, then compares that ratio with the same mask rotated against the complexity field.
The rotation keeps each row's wall count and spacing and breaks only the alignment, and `separates`
is `ratio > null_ratio`: a ratio the best rotation matches is not a separation. Over 249 observed rows
at 256 cells, seed 11: rule 18 gives 2.14 bits on the mask against 1.62 elsewhere (ratio 1.32, best
rotation 1.22), and rule 36 gives 3.50 against 0.85 (ratio 4.14, best rotation 2.94). Both hold
across six seeds — rule 18 by 5-9%, rule 36 by 30-100%.

The mask has to be wider than the wall index, and that is a limitation of the heatmap rather than of
the tiling. With the wall cell alone rule 18's ratio is 1.24 against a rotation null of 1.38, so it
fails on all six seeds (0.88-0.91 of the null): a phase flip is a boundary between cells, and the
defect sits on both sides of it. `tests/test_inspector.py` pins the one-cell failure so it cannot be
quietly repaired by widening the mask further. Rule 30 gets `None`, because its tiling walls off a
third of every row and a ratio over that would measure the absence of a decomposition.

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

**As implemented (engine only).** `crates/ca-core/src/hashlife.rs` holds the canonical quadtree, the
memoised step and the rule-agnostic 4×4 leaf case, transcribed from Rokicki's `nextGeneration`
(Tomas G. Rokicki, "An Algorithm for Compressing Space and Time", *Dr. Dobb's Journal*, April 2006).

The differential tests pad the reference torus by the number of generations being compared, so the
wrap cannot reach the compared window inside those generations: on a 24×24 soup at 30% density
(seed 12345) over 16 generations the two engines agree cell for cell, and the populations agree with
them. Still lifes keep their population exactly over 32 generations; a glider returns to its own
shape after four generations and not after two; equal subtrees canonicalise to one node id; a step
that would pass the node cap returns an error naming the cap and the number of hits rather than
silently exceeding it.

**Glider translation is measured against a still life, not against the root.** A compressed step
returns the centre half of its root and the engine rebuilds that root before every step, so a
cell's coordinates are not comparable between calls. `tests/hashlife_tests.rs` puts a block beside
the glider and treats the block's own shift as the frame's shift: what survives subtracting it is
one cell diagonally per four generations, two per eight. The block is out of reach in both cases,
so it cannot be perturbed within the generations measured.

**The benchmark names the slow case.** `crates/ca-core/examples/hashlife_bench.rs` measures a glider
(`2^20` generations in about a millisecond) and chaotic soups at 64, 128 and 256 cells; the table,
and the machine it was taken on, are in `docs/performance.md`. The soups are near-naive, and the
reason is the tree rather than the rule: a compressed step is only usable when the whole pattern
fits inside the centre half of its root, and a 128-wide chaotic soup fits nothing above a single
generation, so `step` falls back to the sparse sweep.

Not yet done, and therefore not claimed: Golly-captured golden generations. The population
criterion is met exactly for still lifes and as the engine's own count elsewhere — it is not yet
cross-checked against the reference over long runs.

**The zoom UI.** `crates/ca-wasm` exposes the tree itself: `hl_input` and `hl_load` for a pattern,
`hl_load_macrocell` for a Golly file, `hl_step` for the variable time step, `hl_view` for a
level-of-detail window in which each byte is the population of the node that pixel covers, and the
node count, cap and cap hits for the gauge. The page renders at level `floor(log2(cells per pixel))`,
so a node smaller than a pixel draws as its density and a metapixel-sized pattern stays legible when
zoomed out. The module's node cap is 4,194,304; the 2×2 metapixel array uses 987,560 of them. Read as
a macrocell it costs about 69 MB of module memory, against the 102 MB measured when the same tree
was loaded from a cell grid — the grid alone is 38 MB of bytes the tree does not need. The gauge
shows the fraction used, so the heaviest exhibit states its cost instead of hiding it.

Spacing the four copies one 4096-square apart is what halves that. Edge to edge, copies of a
2058-cell unit cell sit at different phases of the quadtree — 2058 is not a power of two — so no
subtree is ever equal and the array costs 2,307,268 nodes and about 274 MB. At a power-of-two
spacing the quadrants do match, but only partly: the engine centres every pattern in its root, so
two copies still share a quadrant and the saving is 2.7× rather than the 4× a perfect alignment
would give. Both numbers are measured against the built module, one fresh instance per pattern,
because wasm memory never shrinks and a shared instance would report the peak of whatever ran first.

**The arena and the index were packed after that.** A node is 32 bytes rather than 40: the level is a
`u8` and the memoised result is a bare id with a sentinel, where `Option<NodeId>` spends eight bytes
for four. The index is an open-addressed table of ids whose key is the node's own four children — 4
bytes a slot against a `HashMap` entry's 24, about 8 MB on the array instead of 50. Four children fix
a node's level, so dropping the level from the key is sound, and
`the_index_finds_every_interned_node` is the check: it walks every node after sixteen generations and
demands each one back from the index, which fails if two nodes ever shared a key. The array went from
279 MB to 102 MB with the node count unchanged at 987,560. `memory_bytes` reports what the arena and
the index hold, and `a_node_and_its_index_slot_cost_at_most_forty_bytes` pins it at forty bytes a node
or fewer — thirty-two for the node, the rest index slots — over a 64×64 soup stepped 32 generations,
so a field added to `Node` or a key put back into the index fails a test rather than a paragraph.

**The writer.** `writeMacrocell` emits the same M2 format the reader accepts, and the tests
round-trip the whole 2058-square metapixel through it cell for cell (2.4 s, 30k nodes). The leaf
format is not guessed: the tests carry Golly's own 57-byte export of a glider, committed unmodified
by the IOCCC 2019 entry *dogon* (`ioccc-src/winner`, `2019/dogon/glider.mc`) — the only
Golly-written `.mc` reachable from here — and assert that our writer produces that leaf byte for
byte, and that our reader turns Golly's file back into the glider it drew. Golly's file differs from
ours only in its `#C` comment and the extra root node it pads the pattern into, which records where
the pattern sat in its universe and not a difference in the format. The writer canonicalises the
rule string, because the published metapixel RLE spells it `b3/s23` and a macrocell is read by
programs that expect `B3/S23`; the engine's reader refuses a `#R` that disagrees with the rule it was
opened with, rather than drawing the pattern under a rule the file did not name. The step control offers
powers of two because a compressed step is one, the tree view reports nodes against `4^level`
nominal cells, and the URL carries the pattern, generation, scale and origin, so a view is
shareable.

RLE is parsed in the page and written straight into the module's memory; a macrocell is not
flattened at all. The reader lives beside the tree in `crates/ca-core/src/hashlife.rs` and
`hl_load_macrocell` takes the text, so the file's own quadtree becomes the engine's — the array is
38 MB as a byte grid and 1.7 MB as an M2 file. Two pattern files ship as fixtures and are asserted
cell for cell by the tests: the Gosper glider gun (36 cells) and Riley's breeder (38 cells in 135×41,
quadratic growth), with the OTCA metapixel — Brice Due's 2058×2058 unit cell of 64,691 live cells,
quoted from the LifeWiki pattern collection — tiled into the 2×2 array the nested-structure zoom is
about. The array is 6154×6154 with 258,764 cells, one copy per 4096-square; at 640 pixels across
6154 cells a pixel covers a node, so four metapixels read as four densities and zooming in resolves
each one into its own structure. The array's macrocell is generated at build time from the published
RLE (`npm run build:fixtures`), which keeps the published pattern the source of truth and keeps
derived text out of the repository. The reader is pinned to the grid loader rather than trusted: a
Golly glider through both paths builds the same arena node for node, and the page's own test pins the
array at the 987,560 nodes the grid path built.

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

**Bond and site directed percolation sit at named points.** Bond DP is the line `p2 = p1(2 - p1)`,
critical at `p1 = p_c = 0.644700185(5)`, which is `(p1, p2) = (0.644700185, 0.873762040)`; site DP
is `p1 = p2 = 0.70548522(4)`. `p_c` is non-universal, and these are the `(1+1)`-dimensional
square-lattice values from Jensen's low-density series, J. Phys. A **32**, 5233 (1999),
[arXiv:cond-mat/9906036](https://arxiv.org/cond-mat/9906036); the mapping onto `(p1, p2)` is
Hinrichsen, Adv. Phys. **49**, 815 (2000). The bond point is easy to mis-state as `(0.5, 0.75)`,
which is below the transition: a probe that ran there returned an absorbing lattice rather than a
decay.

### As implemented

`src/computation_atlas/stress.py` writes `products/stress/panel.json`; `site/stress.html` decodes it
and draws three panels. Nothing is computed in the browser, so a figure and the committed bytes
cannot disagree.

**A lattice is one integer.** One bit per cell, so an update is a handful of shifts and masks on an
`L^2`-bit integer instead of a Python loop over cells, and the cost per step does not depend on the
lattice area. That is what makes a pure-Python sweep affordable: the whole product takes about 40
seconds, which is also what the staleness test costs.

**Noise is exact, and the grid says so.** A mask whose bits are independently one with probability
`m/2^k` is built by bit-slicing `k` random words and comparing the sliced value against `m`, so the
noise grid is dyadic — `1/64, 1/32, 1/16, 3/32, 1/8, 1/4` — and every value is exactly
representable. A decimal grid would have forced either per-cell sampling or a probability the
document would have had to round while claiming not to.

**The stored bit is lost when fewer than half the cells still hold it.** A run that reaches the cap
is a lower bound: the document carries `capped` and the page draws it on the cap line, never as a
lifetime. Measured at 8, 16, 32 and 64 cells, cap 5,000, seeds 11, 23 and 37 (medians; `>=` marks a
run that reached the cap):

| ε | NEC 8 | 16 | 32 | 64 | 4-neighbour 8 | 16 | 32 | 64 |
|---|---|---|---|---|---|---|---|---|
| 1/64 = 0.0156 | >=5000 | >=5000 | >=5000 | >=5000 | >=5000 | >=5000 | >=5000 | >=5000 |
| 1/32 = 0.0313 | >=5000 | >=5000 | >=5000 | >=5000 | >=5000 | >=5000 | >=5000 | >=5000 |
| 1/16 = 0.0625 | >=5000 | >=5000 | >=5000 | >=5000 | 807 | >=5000 | >=5000 | >=5000 |
| 3/32 = 0.0938 | 544 | 445 | 561 | 2388 | 110 | 409 | 471 | 370 |
| 1/8 = 0.125 | 16 | 56 | 121 | 103 | 49 | 51 | 84 | 82 |
| 1/4 = 0.25 | 6 | 11 | 14 | 18 | 12 | 9 | 10 | 13 |

What the table supports, and what it does not:

- At 1/16 the NEC runs reach the cap at every lattice while the four-neighbour rule loses the bit at
  8 cells after 807 steps: same noise, same page.
- At 3/32 the NEC lifetime climbs with lattice size (544, 445, 561, 2388 — the 16-cell dip is one
  seed) while the four-neighbour rule is flat (110, 409, 471, 370). That is the scaling difference
  the theorem is about, not a speed difference.
- At 1/8 and 1/4 both rules collapse, and NEC is the faster loser (16-121 against 49-82 at 1/8).
  Toom's result is a survival statement, not a speed statement, and the panel says so rather than
  hiding the regime.
- A finite lattice cannot prove a threshold. The table shows where lifetimes stop growing with `L`;
  what makes that a threshold is the quoted theorem, and the page labels it as quoted.

**The contrast rule is the four-neighbour majority, not the five-cell one.** Including the cell's own
value gives a different rule, one with a threshold of its own, and it outlasts NEC at 1/8. The design
document's "plain majority of neighbours" is the symmetric rule without self, with a 2-2 tie broken
by a fair coin: a full row of ones is all ties, so the interface wanders and the bit is lost.
`tests/test_stress.py` pins that tie-break, because removing it would quietly change the rule.

**The phase diagram is a measurement at one size.** Active fraction over the 17 x 17 `(p1, p2)` grid
at `L = 256` for 400 steps with seeds 11 and 23. The boundary is the contour where the active
fraction crosses one half. It passes within one grid step of the bond point (0.625, 0.8125 against
0.6447, 0.8738) and through the site point's row (0.6875, 0.6875 against 0.7055, 0.7055). The two
literature points are ringed on the page, and the page says they are quoted, not proved by a
256-cell lattice.

**The decay is measured in the equivalent bond process.** `(p1, p2)` on the 1/16 diagram grid would
round `p_c` by 0.02, which is far off criticality; the bond process takes `p` as a single
probability, so `p = 2641/4096 = 0.6447754` is within 7.5e-5 of the quoted value. 32 seeds per
lattice, `L = 512` and 1024, 4,000 steps from a 50% row; the fit is the log-log slope of the density
**averaged over seeds**, not the average of per-seed slopes, because one ring is a single correlated
sample and its own slope is nearly meaningless. The interval is a percentile bootstrap over seeds
(200 resamples).

| L | δ̂ | 95% interval | verdict |
|---|---|---|---|
| 512 | 0.180 | 0.139 - 0.216 | consistent |
| 1024 | 0.137 | 0.115 - 0.155 | consistent |

The two lattices straddle the quoted `δ = 0.159464(6)`, which is what a finite-size estimate at this
ensemble size looks like; neither is a claim to the quoted precision. The tolerance is stated as
`±0.05` because 4,000 steps cannot resolve six decimal places — the band is set by what the run
resolves, not by the precision of the value it is compared with. A run that absorbed inside the
window yields no fit and is reported as undecided.

**Noise overlay: what the statistic is.** `src/computation_atlas/noise.py` writes `products/noise/`,
a manifest plus four 16,384-byte survival grids; the atlas page interpolates them and never
simulates. A rule's survival is measured on a 16 x 16 torus for 24 steps from a soup, each cell's
state flipped independently with probability ε. The statistic is the density-normalised excess
neighbour agreement

`C_n = (agree - baseline) / (1 - baseline)`, with `baseline = ρ² + (1 - ρ)²`,

where `agree` is the fraction of four-neighbour pairs in the same state and `ρ` the final density.
A uniform field and a random field at any density both read 0 by construction, and a perfect sparse
still life reads 1. Raw excess agreement was rejected because density dominates it: the same still
life scored 0.03.

**How much of the chart is measured.** 128 x 128 samples over the 512 x 512 chart — every fourth
index, each sample drawn over the 4 x 4 cells it stands for. Four stored levels,
ε ∈ {0, 1/64, 1/32, 1/8}; the slider interpolates linearly between them and counts in 1/1024, so
every position is an exact dyadic rate. One soup (seed 11) and one noise realisation per step (seed
23) are shared by every rule: common random numbers, so a difference between two rules is not a
difference between two random draws. The full 512 x 512 chart was rejected as unaffordable — the
nibble kernel costs about 60 µs per step, which is half an hour of sweep against 2.5 minutes.

**Collapsed means below 0.10 excess agreement.** At ε = 0 that is 66% of rules, at 1/8 it is 88%.
The page states both numbers rather than implying that most rules have structure to lose: most
Life-like rules are already uniform or noise-dominated with no noise at all. Collapsed cells are
hatched as well as darkened, so the distinction does not depend on colour.

**Hierarchical error correction (pedagogical).** Concatenated-majority tower: a block of three cells
encodes one cell at the next level, and blocks of those encode the next again. Five levels, leaf
error rates 0.01, 0.05, 0.1, 0.25 and 0.4, 1000 trials, seed 41. The recursion is `p' = 3p² - 2p³`,
the probability that at least two of three inputs are wrong; the page also measures the built tower
by counting wrong nodes at every level, and the two agree within sampling error (at ε = 0.1:
0.0280 against 0.0274 at level 1, 1.6e-5 against 2.2e-4 at level 3). Below 1/2 the recursion has a
stable fixed point at 0, above it one at 1: the gate is its own threshold.

**No threshold is claimed for the tower.** 1/2 is the fixed point of `3p² - 2p³`, not a noise
tolerance for any automaton, and the page says so in the panel and again in the caption. The analogue
assumes independent leaf errors and a shallow tree; Gács's 1D construction has to survive errors that
arrive correlated inside a cellular neighbourhood, which is why it is far more intricate and why
nothing here is a claim about it.

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
Machine strings are taken from the bbchallenge wiki and checked there before use. The Antihydra
string quoted in the design document did not match the wiki and has been replaced by the wiki's
`1RB1RA_0LC1LE_1LD1LC_1LA0LB_1LF1RE_---0RA`; every string in the product now round-trips through the
parser to exactly the text the wiki publishes.

**As implemented.** `src/computation_atlas/verifier.py` holds the deciders and the search,
`src/computation_atlas/checker.py` the checker: its own parser and its own stepper, no import from
the decider module, so a bug in one cannot hide in the other. The search enumerates machines in
define-on-visit tree normal form — the first transition is fixed to `1RB` and every state is
introduced the first time it is reached — which is 166 two-state, 20,686 three-state and 3,495,618
four-state machines. Over those it reproduces `S(2)=6`, `S(3)=21` and `S(4)=107`; the champion
`1RB1LC_1RC1RB_1RD0LE_1LA1LD_---0LA` halts after 47,176,870 steps.

Every machine lands in exactly one class, and the product records the counts. At four states:
735,932 halt, 513,705 are certified, 1,162,121 are heuristic and 1,083,860 are undecided. At two:
60 / 31 / 13 / 62, at three: 5,516 / 3,533 / 4,640 / 6,997. A verdict is *certified* only when the
checker accepted the certificate; a *heuristic* guess carries no certificate and is never promoted
to one, so it stays visibly weaker. *Undecided* means the 256-step cap was reached with a written
span wider than 64 — it is a limit of this search, never a claim that the machine runs forever. A
bouncer is counted as the confined subset of the cycler (span at most 8) rather than as a fourth
verdict, because every exact cycle in this space is narrow.

Two things the checker caught in the deciders, both fixed rather than suppressed: a `start` recorded
at the wrong step, so the two configurations compared were one transition apart, and a bounded
certificate for a machine marching right forever. It also forced a third correction: a cycle
certificate must name the *smallest* period, since a multiple of the true period replays just as
well and would certify nothing. The labelled set (seed 97, fifteen machines spanning all three
kinds) has every certificate accepted and every mutation refused — a step count off by one, a
shift off by one, a period off by one, and a kind relabelled as a translation. A shifted start is
not among the mutations: a true cycle is true from any phase, so that mutation would have been a
test of nothing.

**Cryptids.** Four quoted machines whose halting problem is tied to an open problem — Bigfoot
(BB(7)), Antihydra, Lucy's Moonlight and Space Needle (BB(6)) — are run for the same 256 steps and
reported as what that run is: a guess with no certificate, next to the wiki's own words about each
one. The page says in the same row that the run proves nothing about halting, because a cryptid is
quoted precisely because nobody knows. This is an exhibit of the classification, not a search: the
six-state space is not enumerable here, and nothing in the product counts a cryptid as decided.

**The growth is measured, and drawn.** Each cryptid also runs for a hundred million transitions on
the array tape, sampling the written span at each decade from 10³ to 10⁸: 15,454, 14,148, 25,756 and
1,663 cells at the last sample, and none of them halted. Each sample also records the span it gained
since the one before, so the row can say where the growth is and not only that there is some: the
fastest decade is the last for all four (+10,560, +9,715, +17,832 and +860 cells). The row draws the
span against a log step axis and carries the same numbers in its `aria-label`, including that fastest
decade, so the chart adds a picture to the sentence rather than replacing it — a reader without the
chart still gets every number. Growth is the shape of the walk and not a proof: the sentence beside
the chart still says a hundred million steps decide nothing. The budget is written into the product
(`cryptid_steps`, `cryptid_samples`) so the figure cannot outlive the run that produced it, and a
machine that halts inside the budget is recorded as halted rather than as growth.

What is not claimed: the checker is a second implementation, not a proof, and it says only "this
certificate replays". BB(5) is quoted from the paper, not re-proved here; the four-state sweep is
this project's own, and its undecided residue is reported as it stands.

## M7 · Heritage

The original sandpile lab's least-squares fit on raw counts is biased by the tail floor at count 1
(the flat line at `10^0`). Replace it with log-binned histograms, maximum-likelihood power-law fits
with goodness-of-fit, finite-size-scaling collapse and bootstrap intervals, and show the two fits
side by side.
