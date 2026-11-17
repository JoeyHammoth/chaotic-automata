# Computation Atlas v2: Design and Implementation Plan

| | |
|---|---|
| **Status** | Draft 1: design for review, nothing built yet |
| **Date** | 18 November 2026 |
| **Deliverable** | A static, serverless web app deployed on GitHub Pages (with free fallbacks), plus a reproducible offline data pipeline |
| **Primary audience** | Admissions committees, research-software hiring managers, computational physics / ML-for-science teams |
| **Origin** | Extends a complex-systems lab (Abelian sandpile, power-law fits) into a map of *computation itself* |

> **How to read this document.** Sections 1-3 say *what* and *why* (concept, science). Sections 4-7 say *how* (architecture, data, frontend). Sections 8-12 cover validation, deployment, schedule and risks. Appendices hold code skeletons and references. Code in this document is **skeleton-level and untested**; treat it as a design aid, not a drop-in implementation.

---

## 0. TL;DR

**Computation Atlas** is an interactive, zoomable *map of rule space*: a chart whose every point is a different cellular automaton (or other discrete dynamical system), coloured by what it *does* (frozen, periodic, chaotic, or capable of computation) and drawn with "coastlines" where behaviour changes character. You can pan and zoom the map, click any point to run that world live, and open instruments that look *inside* it:

- an **Inspector** that decomposes spacetime into domains, particles and interactions using computational mechanics (epsilon-machines and local causal states);
- a **HashLife zoom** where Conway's Life runs *inside* Life (via memoised quadtrees), exposing the fractal data structure behind exponential-speed simulation;
- a **Stress Lab** that adds noise and shows where reliable computation survives (Toom's rule, the Domany-Kinzel directed-percolation transition, hierarchical error correction);
- one **signature module** you choose: **Forge** (learn discrete rules by gradient descent with Differentiable Logic CA) or **Verifier** (decide Busy Beaver-style Turing machines with proof-carrying certificates, with an honest "unknown" outcome).

What makes it portfolio-grade rather than a demo:

1. **Frontier methods** (2024-2026) are used for real, not name-dropped: foundation-model rule-space illumination (ASAL), differentiable logic CA, formally-verified Busy Beaver methodology, hierarchical fault-tolerant CA, local causal states.
2. **Scientific honesty is a feature**: several competing complexity metrics are shown side by side, undecidable cases get an explicit *undecided* class, and every figure carries seed, version and a reproduce link.
3. **Serious engineering**: Rust to WebAssembly engines, WebGPU compute with a fallback ladder, a validation suite against published results, differential testing (GPU vs CPU vs reference), and a CI-driven static deployment.
4. **A distinctive frontend**: the chart *is* the interface. The hero is the live atlas, not a marketing slab.

---

## 1. Goals, non-goals, success criteria

### 1.1 Goals

| ID | Goal | Evidence it is met |
|---|---|---|
| G1 | Demonstrate computational-physics depth on chaotic, stochastic and computational systems | Validation suite reproduces published results (Section 9) |
| G2 | Demonstrate software-engineering depth | Typed multi-language codebase, tests, CI/CD, benchmarks, documented architecture |
| G3 | Be visually memorable on first load | Live atlas hero with no loading spinner longer than ~2 s on a mid-range laptop |
| G4 | Run entirely client-side, hosted free | Static site on GitHub Pages; zero servers |
| G5 | Be honest about limits | A "Limitations" page, an *undecided* class, uncertainty on every estimate |
| G6 | Be explorable by non-experts in 90 seconds | Guided tour with six chapters (Section 7.4) |

### 1.2 Non-goals

- Proving new theorems or claiming novel research results. The aim is faithful, well-instrumented reimplementation plus a *comparison* contribution (metric disagreement, see 3.2).
- Training large models in the browser. Heavy training runs offline; the browser runs inference and analysis.
- A backend, accounts, analytics or user data collection.
- Supporting every browser at full capability; the app degrades gracefully in tiers (Section 4.5).

### 1.3 Success criteria (ship checklist)

- [ ] Atlas loads and is interactive within 2.5 s (LCP) on a throttled mid-range profile
- [ ] 60 fps pan/zoom on the atlas at 1080p on integrated graphics
- [ ] All validation targets in Section 9 pass in CI (CPU tier)
- [ ] GPU and CPU engines agree bit-for-bit on deterministic rules (differential tests)
- [ ] Every figure exports with a reproduce URL (rule, seed, version hash)
- [ ] Lighthouse accessibility >= 95; keyboard-complete; `prefers-reduced-motion` honoured
- [ ] README, "Methods" page, "Limitations" page, 90-second demo video

---

## 2. Concept and narrative

### 2.1 One-sentence pitch

*A navigable map of the space of simple programs, showing where order ends, chaos begins, and computation, noise-robust or not, lives in between.*

### 2.2 The story the site tells (six chapters)

The guided tour is a genuine sequence, so chapters are numbered.

1. **The map.** Every pixel is a different rule. Colour is what it does.
2. **The coastline.** Zoom to a boundary between "dies out" and "chaos". It stays intricate at every scale.
3. **Inside a rule.** Open the Inspector: domains, particles, collisions. Computation as moving structure.
4. **Life inside Life.** HashLife zoom through a self-simulating pattern. Exponential time jumps from a fractal data structure.
5. **Noise.** Switch on errors. Most computation dies; some rules and constructions survive. The map's colours change.
6. **The edge of what can be known.** Signature module (Forge or Verifier): where rules are learned, or where "we cannot decide" is the correct answer.

### 2.3 Module inventory and tiering

| Tier | Module | One-liner | Frontier hook |
|---|---|---|---|
| **Core** | M1 Atlas | Zoomable map of rule space with multiple colourings | ASAL-style illumination; multi-metric disagreement |
| **Core** | M2 Inspector | Domains, particles, local complexity for 1D CA | Computational mechanics, local causal states |
| **Core** | M3 HashLife Zoom | Infinite zoom in space and time through Life | Memoised quadtrees; Life-in-Life metapixels |
| **Core** | M4 Stress Lab | Noise, Toom's rule, directed percolation, hierarchical error correction | Fault-tolerant CA (Toom, Gacs); 2026 self-correcting QCA lineage |
| **Signature (pick one)** | M5a Forge | Learn discrete CA rules by gradient descent | Differentiable Logic CA (2025) |
| **Signature (pick one)** | M5b Verifier | Decide Turing machines with checkable certificates and an *unknown* class | bbchallenge / Coq-BB5 methodology (2024-25) |
| **Stretch** | M6 Compiler | Compile a cyclic tag system into a Rule 110 initial condition and run it | Cook's universality construction |
| **Stretch** | M7 Heritage | Original sandpile lab rebuilt on the shared engine, with proper power-law statistics | Log-binned MLE, finite-size scaling |

> **Scope warning.** Eight modules is a portfolio *vision*, not a build plan. The recommended spine is M1 + M2 + M3 + M4 + one of M5a/M5b. M6 and M7 are cut-lines (Section 11).

---

## 3. Scientific and algorithmic design

Each subsection gives: purpose, algorithm, data products, validation targets, and known risks.

### 3.1 M1: Atlas

#### 3.1.1 Rule families

**Family A: Life-like totalistic CA (discrete, exhaustive).**
Rule = (Birth set B subset of {0..8}) x (Survival set S subset of {0..8}), i.e. 2^9 x 2^9 = **262,144 rules**, which tile a 512 x 512 chart exactly.

- **X axis:** Birth mask, Gray-coded (adjacent columns differ in exactly one birth condition).
- **Y axis:** Survival mask, Gray-coded (adjacent rows differ in exactly one survival condition).
- Gray coding gives the map real locality: neighbouring pixels are *minimal edits* of each other, which is what makes "coastlines" between behaviours meaningful rather than noise.
- B0 rules (birth with zero neighbours) flicker the empty universe; handle by evaluating on the standard two-step transform or flag them explicitly. Decide in implementation and document it.
- Conway's Life (B3/S23) is a labelled landmark.

**Family B: Lenia-lite plane (continuous, live-computed).**
Single-channel continuous CA on an N x N torus:

```
U   = K * A                      # convolution with a ring/shell kernel, radius R, normalised to sum 1
G(u) = 2 * exp(-(u - mu)^2 / (2 * sigma^2)) - 1
A  <- clip(A + dt * G(U), 0, 1)
```

The chart axes are growth-function parameters (mu, sigma). Each pixel = one short simulation from a fixed seeded initial blob. Typical viable region is a thin, intricate band, which is where the "coastline" lives. Optional toggle (stretch): **Flow-Lenia** mass-conserving variant via reintegration tracking, to ask whether conservation changes where "interesting" behaviour lives (the physics link back to the sandpile lab).

**Family C: Probabilistic plane (Stress Lab, shown in the Atlas as an overlay).**
The Domany-Kinzel (p1, p2) phase diagram (see 3.4). Included in the same viewer so that "noise changes the map" is literally visible.

#### 3.1.2 The instrument panel (metrics)

Computed per rule (Family A offline, Family B live). All metrics carry an uncertainty estimate (bootstrap over seeds).

| Metric | Definition | Notes |
|---|---|---|
| **Damage-spreading rate** | Run twin replicas differing in one cell; fit the growth rate of Hamming distance (and left/right front speeds) | Bagnoli-style CA "Lyapunov exponent". Caveat: replicas can resynchronise by chance; report fraction of runs where damage died |
| **Lyapunov profile** *(stretch)* | Spatially resolved defect growth per Baetens-Gravner | Unifies competing CA Lyapunov definitions |
| **Transient length / period** | Brent cycle detection over hashed states on a finite torus; cap at T_max | Hitting the cap yields **undecided**, not "chaotic" |
| **Activity** | Fraction of cells changing in the last W steps | Cheap order/chaos proxy |
| **Block entropy** | Normalised Shannon entropy of 3x3 spatial blocks and k-step temporal blocks | |
| **Compression complexity** | Compressed size / raw size of spacetime (via the browser/Python deflate; document the codec) | Rough algorithmic-complexity proxy; label it as such |
| **Localised-structure score** | Count and lifetime of connected components persisting after transient | Detects gliders / solitons |
| **Langton lambda** | Fraction of non-quiescent table entries | Shown **deliberately** as the *cautionary* metric: the 1993 re-examination of the edge-of-chaos claim found the original interpretation did not hold, so lambda is displayed beside better metrics, with a note |
| **Foundation-model embedding** | Embedding of a rollout filmstrip (e.g. DINOv2 or CLIP) | Precomputed offline; powers an alternative map layout and "find similar rules" |
| **Undecided mass** | Fraction of runs hitting the budget cap | Rendered as hatched texture over the map |

**Key comparison contribution ("metric disagreement map").** Compute an agreement score across metric-derived classifications (e.g. entropy-based vs damage-based vs embedding-cluster-based). Pixels where the classifiers *disagree* are rendered as a separate layer. This is cheap to build, genuinely informative (it shows where "chaos" is a definition-dependent label) and easy to defend as an honest result.

#### 3.1.3 Foundation-model illumination (ASAL-inspired)

Reference: Kumar et al., *Automating the Search for Artificial Life with Foundation Models* (arXiv:2412.17799). ASAL searches simulation spaces with vision-language models, supporting target search, open-endedness search and illumination across substrates including Life-like CA and Lenia.

Planned use (offline):

1. Render a short filmstrip (e.g. 8 frames, 64 x 64) per rule.
2. Embed with a vision foundation model (check model/weight licence; open_clip is an alternative).
3. Reduce to 2D with UMAP or PCA for an **alternative layout**, and keep a compact vector (e.g. 16-32 dims, fp16) for similarity search.
4. **Text-to-rule search** (optional): embed a text prompt ("gliders", "stripes", "cell-like blobs") with a vision-language model and rank rules by similarity. Precompute top-K for a curated prompt list; do not ship a text model in the browser.
5. Open-endedness score (stretch): novelty of embeddings over time in each rollout.

Compute note: ~262k rules x a few frames is on the order of 10^6 images; this is a GPU job (hours or less on a modest GPU; if no GPU is available, embed a stratified subsample and propagate by k-nearest neighbours in metric space, documenting the approximation).

#### 3.1.4 Data products

| Artifact | Contents | Approx. size |
|---|---|---|
| `lifelike_metrics.bin` | 512 x 512 x ~16 metrics, fp16 | ~8 MB |
| `lifelike_classes.bin` | Per-pixel class labels and agreement score | <1 MB |
| `lifelike_embed2d.bin` | 2D UMAP coordinates, fp16 | ~1 MB |
| `lifelike_embed_vec.bin` | Compact embedding vectors | ~8-33 MB |
| `tiles/{z}/{x}/{y}.webp` | Pre-rendered colourings (pyramid) | tens of MB |

Rollout thumbnails are **not** shipped (that would be hundreds of MB); they are simulated on demand in WASM in a few milliseconds.

#### 3.1.5 Validation targets

- Conway Life (B3/S23): known still lifes, gliders and periods reproduce.
- Known rules (HighLife B36/S23 replicator, Seeds B2/S, Day & Night B3678/S34678) land in their expected qualitative regions.
- Metric pipeline is deterministic given seeds (golden-file test on a 64 x 64 sample region).

#### 3.1.6 Risks

- Compute budget for the offline sweep. Mitigation: bit-sliced SWAR simulation and/or GPU; early benchmark; subsample fallback.
- Over-interpreting class boundaries. Mitigation: uncertainty overlays and the disagreement layer.

### 3.2 M2: Inspector (computational mechanics)

**Purpose.** Turn a spacetime diagram into *structure*: regular domains, the particles that live on domain walls, and their interactions, i.e. "computation as moving structure".

**Scope.** 1D binary CA of radius 1-2 (the 256 elementary rules, plus a small curated set of radius-2 rules). Restricting dimension and alphabet is what makes this tractable and honest.

**Algorithms.**

1. **Spatial epsilon-machine for domains.** Infer a minimal automaton (causal states) for rows of the spacetime field; regular domains appear as recurrent, periodic substructures. Practical route: Causal State Splitting Reconstruction (CSSR) or a simple history-based clustering with a statistical test, run on spatial strings with bounded history length L (e.g. L = 3..8).
2. **Domain filtering.** Run the inferred domain transducer over the field; cells consistent with the domain are masked, leaving *particles* and *collisions* highlighted.
3. **Local causal states (lightcone method).** For each spacetime cell, take its past lightcone of depth h and future lightcone of depth f; cluster cells whose conditional distributions over futures are statistically equivalent. Local statistical complexity is the surprise of a cell's causal state. Low in domains, high at particles. Reference: Rupe & Crutchfield, *Local causal states and discrete coherent structures* (arXiv:1801.00515); local complexity filtering is from Shalizi et al.
4. **Particle tracking.** Connected components of the filtered field to world-lines; estimate velocity and period; build a collision table (A + B -> C + D).
5. **Damage-spreading overlay.** Show the twin-replica difference field next to the spacetime diagram.

**Product features.**

- Side-by-side: raw spacetime / domain-filtered / local complexity heatmap.
- Click a particle to see its velocity, period and collision partners.
- A "known results" panel: Rule 18 shows a single regular domain of the form (0 Sigma)* (every other cell zero, the rest free); Rule 110 shows ether plus gliders; **Rule 30 is explicitly labelled *no known domain decomposition***, per the recent literature noting that basic structural questions remain open. Showing an open problem as open is a credibility signal.

**Validation targets.**

- Rule 90: reproduces the Sierpinski/Pascal-mod-2 pattern exactly (unit test against Pascal's triangle mod 2).
- Rule 18: recovered domain matches the published (0 Sigma)* structure.
- Rule 110: recovered ether has the published spatial/temporal period (verify the exact periods against Cook / Wolfram before hard-coding, and treat that value as a golden test).
- Statistical sanity: shuffled-time null spacetimes should yield *no* spurious particles above a stated false-positive rate.

**Risks.**

- Finite-data bias in causal-state reconstruction. Mitigation: bounded L, significance-tested splits, bootstrap stability of the number of states, and conservative "inconclusive" labelling.
- 2D reconstruction is substantially harder; explicitly out of scope.

### 3.3 M3: HashLife Zoom

**Purpose.** A showpiece where an *algorithm* is the visual: the universe is stored as a canonical quadtree, so identical sub-patterns are shared and each node caches its own future.

**Core idea.** A level-k node covers 2^k x 2^k cells and stores four children, a population count, and a cached `result`: the centre 2^(k-1) square advanced 2^(k-2) generations. Canonical hash-consing guarantees each distinct sub-pattern is computed once. Enormous, repetitive patterns (breeders, metapixel arrays) can jump astronomically far per wall-clock second, while chaotic soups degrade to near-naive speed (an honest "HashLife-unfriendly" benchmark is part of the exhibit).

**Features.**

- Arbitrary-depth zoom: render the quadtree with level-of-detail; a node smaller than a pixel is drawn as its population density. Zooming out through a Life-in-Life pattern shows *each cell is itself a large Life pattern* (OTCA metapixel: 2058 x 2058 cells emulating one Life cell).
- Variable time step: step 2^j generations at once (the standard variable-step variant), with the step size shown in the UI.
- A "tree view": the same quadtree drawn as a DAG with sharing ratio (nodes vs. nominal cells), making the fractal compressibility visible.
- Pattern import: RLE and macrocell formats; curated library (glider gun, breeder, metapixel array).
- Rule-agnostic: a 4 x 4 leaf lookup table makes other Life-like rules work, which also lets the Atlas "launch this rule in HashLife".

**Validation.**

- Differential test: HashLife vs naive bit-sliced stepping for N generations on random soups and standard patterns, bit-exact.
- Golden files from an established desktop engine (Golly) for known patterns at fixed generation counts.
- Property tests: canonicalisation (equal subtrees share an id), population count conservation under still lifes, glider translation after known periods.

**Licensing note.** Existing engines are GPL (e.g. Golly, and some Rust HashLife crates). Write your own implementation from the published algorithm; use others only as *black-box* oracles for tests, and keep their code out of the repo.

**Risks.** Memory growth and garbage collection in WASM. Mitigation: arena allocation with generation-based GC, a hard node cap, and a visible memory gauge in the UI.

### 3.4 M4: Stress Lab (noise and reliable computation)

**Purpose.** Show that computation under noise is a *phase diagram*, not a binary, and that fault tolerance in local dynamics has a deep, hierarchical (self-similar) structure.

**Panels.**

1. **Toom's rule (2D).** Each cell takes the majority of itself, its north neighbour and its east neighbour (NEC majority). Under small independent noise, a stored uniform state persists for very long times. Interactive: noise slider, lattice size, plot of stored-bit lifetime vs L and noise; locate the empirical threshold. Contrast with plain majority-of-neighbours, which loses the bit.
2. **Domany-Kinzel automaton (1D probabilistic, (p1, p2) plane).** Standard directed-percolation (DP) universality test bed. Plot the active/absorbing phase diagram; at the critical line, measure the density decay exponent and compare with the DP value (about 0.16 for 1+1 dimensions; treat as a validation *target with finite-size tolerance*, and verify the reference value in the literature before hard-coding).
3. **Hierarchical error-correction visualiser (pedagogical).** Simplified concatenated-majority "tower": blocks of cells encode higher-level cells, which are themselves blocked again. Shows the *self-similar* mechanism behind Gacs-style constructions. **Labelled clearly as a pedagogical analogue, not the actual Gacs construction**, which is far more intricate.
4. **Noise overlay on the Atlas.** For a selected rule, flip each cell with probability epsilon and re-colour the map by "does the structure survive?". Shows how the map's landscape changes with temperature.

**Frontier context to cite on the page.** Toom (1970s) and Gacs (1986, 1989) established reliable storage and computation from noisy local rules; Gacs's 1D construction is hierarchical (units simulate an automaton, which simulates a more reliable one, and so on). A 2026 preprint extends this lineage to a self-correcting, universal *quantum* cellular automaton in 2D (arXiv:2601.20818), and a 2024-26 line of work builds a local automaton for the 2D toric code from Tsirelson/Gacs ideas (arXiv:2412.19803). The app does **not** implement these; it explains how the classical idea scales.

**Validation.**

- Toom: bit lifetime grows with L below threshold, collapses above; random-seed reproducible.
- DK: active/absorbing boundary and DP-class exponent within tolerance at stated sizes; scaling collapse plot included.

**Risks.** Critical exponents are finite-size-sensitive; always display error bars and the system sizes used.

### 3.5 M5a: Forge (Differentiable Logic Cellular Automata) *[signature option A]*

**Purpose.** Show that CA rules can be *learned by gradient descent and still be discrete*.

**Reference.** Miotti, Niklasson, Randazzo, Mordvintsev, *Differentiable Logic Cellular Automata* (arXiv:2506.04912). Each cell's state is a binary vector; the update is a circuit of logic gates in which every gate maintains a distribution over the 16 two-input Boolean functions during training, relaxed to continuous operators for gradients, and **hardened to a pure Boolean circuit at inference**. The paper demonstrates learning Conway's Life exactly, noise- and damage-resilient checkerboards, a grown lizard shape and multi-colour patterns, with both synchronous and asynchronous updates. The CAX library (arXiv:2410.02651) includes a DiffLogic CA example and reports large JAX-based speedups.

**Plan.**

- **Offline training** (JAX/CAX or PyTorch): model zoo of 4-8 trained circuits (Life rule recovery, checkerboard, a small glyph, a growth target). Export hardened circuits as JSON (gate list + wiring + state-channel layout).
- **In-browser:** circuit viewer (layered DAG with each gate labelled by its learned Boolean function), bit-sliced execution on WebGPU or WASM, and interactive **damage and asynchrony** (erase a region; switch to asynchronous updates; watch regrowth).
- **Close the loop:** send any learned rule through the Inspector (are there domains/particles?) and, when it is totalistic and Life-like, place it on the Atlas.
- **Circuit pruning view:** remove gates and re-measure error to show which gates matter (an interpretability exhibit).

**Validation.** The hardened circuit's output must match the training-time hard forward pass exactly; the "Life recovery" circuit must match B3/S23 on all 512 neighbourhood configurations (exhaustive test).

**Risks.** Training instability and time. Mitigation: ship checkpoints; training is *not* part of the live demo.

### 3.6 M5b: Verifier (Turing machines, certificates and "unknown") *[signature option B]*

**Purpose.** Demonstrate the *method* behind the 2024 proof that BB(5) = 47,176,870: a pipeline of simple, untrusted **deciders**, each emitting a **certificate** that a small trusted **checker** validates, with a residue of machines that stay *undecided*.

**Context to cite.** The BB(5) result was established by the bbchallenge collaboration and formalised in Coq (Rocq); it analysed 181,385,789 five-state machines and is the first formally verified Busy Beaver value (arXiv:2509.12337). The bbchallenge pipeline applies deciders such as cyclers, translated cyclers, backward reasoning, halting segment, finite-automata reduction and bouncers. For BB(6), the "Antihydra" machine means a Collatz-like open problem must be solved, and heuristic ("probviously") arguments classify most remaining cryptids.

**Plan.**

- **Machines:** 2-symbol, up to 5 states (and a few 6-state cryptids as exhibits). Use the standard compact text encoding used by bbchallenge (e.g. the Antihydra string `1RB1RA_0LC1LE_1LD1LC_1LA0LB_1LF1RE_---0RA` appears on the bbchallenge wiki; verify strings against the wiki when you pull data).
- **Simulators:** a plain simulator and an **accelerated simulator** that compresses repeated tape patterns (counter-like behaviour), so the BB(5) champion's tens of millions of steps replay instantly.
- **Deciders (implement in Rust, run in WASM):** cycler; translated cycler; a simple bouncer detector. Each returns either *no verdict* or a **certificate** (e.g. the cycle start/period, the translation vector, the bouncer parameters).
- **Checker:** a separate, minimal module that validates a certificate by *independent replay* and does not share code with the decider. Display "certified by checker vX, N steps".
- **Outcome classes:** `halts (n steps)`, `certified non-halting (decider)`, `heuristically non-halting (not proof)`, `undecided`. The UI never collapses the last two.
- **Explorer:** a grid of sampled machines coloured by outcome class, with the undecided residue prominent. Click a machine for the tape/time diagram, the certificate and "replay in checker".
- **Cryptid exhibit:** a page on Antihydra: run the accelerated simulator, show the Collatz-like quantity, explain why the problem is *hard*.

**Validation.** BB(2)=6, BB(3)=21, BB(4)=107 steps by exhaustive search (small spaces); the BB(5) champion halts after 47,176,870 steps (the quoted result); certificates from each decider pass the checker on a labelled test set and *fail* on corrupted certificates (mutation testing).

**Risks.** Scope creep into full decider coverage. Mitigation: three deciders only; the exhibit is the *method*, not a re-proof.

### 3.7 M6: Compiler to Rule 110 *[stretch]*

**Purpose.** A compiler whose target is a cellular automaton, with a debugger.

**Pipeline.** Cyclic tag system (CTS) program -> Rule 110 initial condition using Cook's glider-based construction (ether background; gliders encoding productions) -> run -> decode the spacetime diagram back into the CTS trace and compare.

**Phases.**

1. CTS interpreter and visualiser (easy; ship regardless).
2. Rule 110 viewer annotated with ether and glider types using the Inspector's domain filter (medium).
3. Encoder using published glider data and spacings (hard: exact glider spacings and timings must be taken from Cook (2004) / Wolfram, and checked by decoding).

**Validation.** Decoder output equals the CTS reference trace for a battery of small programs. If phase 3 slips, ship phases 1-2 as "Rule 110 anatomy".

### 3.8 M7: Heritage (sandpile and statistics toolkit) *[stretch]*

Rebuild the original lab on the shared engine as a "where this began" page, and use it to publish the **statistics toolkit** used elsewhere: log-binned histograms, maximum-likelihood power-law fits with goodness-of-fit, finite-size-scaling collapse, bootstrap CIs. Include the one-slide demonstration that the original least-squares fit on raw counts is biased by the tail floor at count 1 (the flat line at 10^0 on your topple histogram), contrasted with the log-binned MLE. This is a short, high-credibility module.

