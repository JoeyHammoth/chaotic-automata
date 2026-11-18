# Computation Atlas v2: Design and Implementation Plan

| | |
|---|---|
| **Status** | Draft 2: complete design (sections 0-12 plus appendices); nothing built yet |
| **Date** | 18 November 2026 |
| **Deliverable** | A static, serverless web app deployed on GitHub Pages (with free fallbacks), plus a reproducible offline data pipeline |
| **Primary audience** | Admissions committees, research-software hiring managers, computational physics / ML-for-science teams |
| **Origin** | Extends a complex-systems lab (Abelian sandpile, power-law fits) into a map of *computation itself* |

> **How to read this document.** Sections 1-3 say *what* and *why* (concept, science). Sections 4-7 say *how* (architecture, data formats, instrument interfaces, frontend). Sections 8-12 cover performance budgets, validation, deployment, schedule and risks. Appendices hold code skeletons, wire formats and the reference list, with a verification log of every quoted number. Code in this document is **skeleton-level and untested**; treat it as a design aid, not a drop-in implementation.

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

- Arbitrary-depth zoom: render the quadtree with level-of-detail; a node smaller than a pixel is drawn as its population density. Zooming out through a Life-in-Life pattern shows *each cell is itself a large Life pattern* (OTCA metapixel: a few thousand cells on a side emulating one Life cell; the exact footprint is read from the pattern's header at import, since the commonly quoted figure is not yet verified).
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
2. **Domany-Kinzel automaton (1D probabilistic, (p1, p2) plane).** Standard directed-percolation (DP) universality test bed. Plot the active/absorbing phase diagram; at the critical line, measure the density decay exponent and compare with the DP value in 1+1 dimensions, `delta = 0.159464(6)`, treating it as a validation *target with finite-size tolerance* (Section 9.2, V7).
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
---

## 4. System architecture

### 4.1 The constraints that decide everything

Five constraints are fixed before any technology is chosen. Everything in this section follows from them.

| # | Constraint | Consequence |
|---|---|---|
| C1 | Static hosting on GitHub Pages, no server | No API, no database, no secrets, no server-side rendering. All computation is client-side or precomputed. |
| C2 | The published map must be reproducible | Data products are immutable, versioned, checksummed and regenerated by a documented command. |
| C3 | Deterministic rules must agree across hardware | Every engine has an independent reference; differential tests are a release gate, not a nicety. |
| C4 | GPL implementations are oracles only | Golly and third-party HashLife crates are never linked, vendored or ported line-by-line. |
| C5 | A visitor may have no WebGPU and a slow laptop | A capability ladder with an exact CPU floor; tiers change speed only, never output. |

C1 deserves emphasis because it removes options people assume exist. GitHub Pages cannot set response
headers: no `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`, therefore **no
`SharedArrayBuffer`**, therefore **no multithreaded WASM**. Parallelism comes from Web Workers with
message passing (structured clone or transfer), not shared memory. Likewise a Content-Security-Policy
must ship as a `<meta>` tag, and cache headers are fixed, so cache-busting is done with content-hashed
filenames rather than `Cache-Control`.

### 4.2 Three layers, one truth

```text
        offline (workstation / CI)                     static (browser)
+--------------------------------------+      +--------------------------------------+
| pipeline/  Python                    |      | site/  TypeScript                    |
|   rule enumeration, metrics,          |      |   atlas, inspector, hashlife,        |
|   sweeps, bootstrap CIs, embeddings   |      |   stress lab, verifier, tour, export |
|   writes products + golden files      |      |   tiers: WebGPU -> WASM -> CPU       |
+------------------+-------------------+      +------------------+-------------------+
                   |   immutable, versioned products                 |
                   +--------------> data/ <--------------------------+
                                      ^
                     engines: crates/ (Rust -> wasm32), shared by
                     the pipeline (native) and the site (WASM)
```

Three rules keep the layers honest:

1. **The site never invents a published number.** Every classification, metric value and embedding
   coordinate rendered on the map was computed offline and shipped in a product. The browser
   recomputes only what it displays live (a rule running under your cursor), never the map itself.
2. **The pipeline never reimplements the engine.** Native Rust and WASM Rust are the same crate
   compiled twice, so an offline sweep and a live run cannot drift apart.
3. **No layer reads another's internals.** The pipeline talks to engines through their public API;
   the site talks to the same API through a thin WASM bridge. That is the only coupling.

### 4.3 Repository layout

```text
source/
  Computation_Atlas_v2_Design_Doc.md   this document
  python/                              legacy sandpile lab (M7 heritage, read-only until migrated)
src/computation_atlas/                 Python pipeline package
  rules/                               rule encodings, Gray code, enumeration
  metrics/                             metric implementations and bootstrap
  sweep/                               job definition, execution, manifests
  products/                            binary writers, tile pyramid
  embed/                               filmstrip rendering, embedding job
crates/                                Rust workspace
  ca-core/                             bit-sliced steppers, neighbourhoods, rules
  hashlife/                            quadtree, canonicalisation, cached results
  deciders/                            Turing machine simulators, deciders, checker
  wasm-bridge/                         the only crate that exports to JavaScript
site/                                  TypeScript application
  src/atlas/  src/inspector/  src/hashlife/  src/stress/  src/verifier/
  src/render/  src/state/  src/ui/  src/workers/
data/                                  generated products (ignored by git; fixtures are committed)
tests/                                 pipeline tests, golden fixtures, differential harness
docs/                                  methods, limitations, architecture, ADRs, research
```

`crates/` and `site/` exist as of the M0 vertical slice (#12); the atlas, the Inspector and HashLife are
still to come (Section 11).

### 4.4 Toolchain

| Layer | Choice | Why |
|---|---|---|
| Engines | Rust stable, `wasm32-unknown-unknown`, `wasm-bindgen`, `wasm-opt -O3` | No C++ toolchain on CI, small binaries, one codebase for native and WASM |
| Site | TypeScript `strict`, Vite, canvas 2D + optional WebGPU | Canvas-first app: a framework buys routing and little else |
| Tests | Vitest (TS), `cargo test` + property tests (Rust), pytest (Python), Playwright (smoke) | Each layer tested where it lives |
| Pipeline | Python 3.11+, NumPy, ruff, pytest | Matches the existing package and the heritage lab |
| CI | GitHub Actions, Ubuntu, Node and Python and Rust caches | Free tier, and the same runner that publishes Pages |

Versions are pinned in `Cargo.lock`, `package-lock.json` and `pyproject.toml`. Upgrades are their own
pull request, and the differential suite is the gate that catches a compiler or SIMD regression.

### 4.5 Runtime tiers

| Tier | Requires | Provides | Falls back to |
|---|---|---|---|
| **T0 · CPU** | ES2020 | every discrete rule at reduced rates, exact output | nothing (this is the floor) |
| **T1 · WASM** | `WebAssembly` + SIMD | discrete rules, HashLife, deciders at full rate | T0 |
| **T2 · WebGPU** | `navigator.gpu` and a working adapter | Lenia-lite, large-grid stepping, metric overlays | T1 |

Detection runs once at startup, in order T2 → T1 → T0, with an explicit probe (compile a trivial
shader, instantiate a trivial module) rather than a feature-string check. The chosen tier is shown in
the status bar, exported with every figure, and overridable by URL (`&tier=wasm`) so a bug report can
name the failing path.

Two invariants make the ladder safe:

- **Output invariance.** For a deterministic rule and a fixed seed, all three tiers produce the same
  cells. Any divergence is a bug filed against the tier, not a documented difference.
- **Feature invariance.** A tier may be slower or coarser, never silently different in *classification*.
  If a metric is unavailable on T0, the view says so and offers the precomputed value instead.

The floating-point rules are the awkward case. Lenia-lite is computed live, so T2 and T0 may differ in
the last bits. Mitigation: Lenia is displayed qualitatively (a classified region), and the exact
comparison is made only between WebGPU and a fixed CPU reference with a stated tolerance (1e-4 on
activation, see Section 9).

### 4.6 The engine seam

The engine is the project's deepest module: one small interface, a large implementation, and tests that
cross the same seam as callers.

```rust
// crates/ca-core/src/lib.rs  (skeleton, untested)
pub trait Engine {
    /// Advance `steps` generations. Deterministic for a given rule and seed.
    fn step(&mut self, steps: u32);

    /// The current grid as a row-major byte slice, one bit per cell packed.
    fn cells(&self) -> &[u8];

    /// Hash of the current grid; the differential tests compare these.
    fn digest(&self) -> [u8; 32];
}
```

Everything a caller must know beyond the signatures is in the doc comment: memory layout, torus
wrapping, how B0 rules are handled, and that `step` is idempotent under zero steps. The adapter behind
the seam differs by tier (`wasm-bridge`, `ts-cpu`, `webgpu`); callers never learn which one they hold.

The **deletion test** applies here: delete `ca-core` and the rule semantics reappear in the pipeline,
the site, the HashLife tests and the stress lab, four times over. It earns its keep.

The representation behind this interface is settled by measurement: bit-packed rows in Rust compiled to
`wasm32`, with a plain `u8` stepper as the reference that keeps it honest ([ADR 0004](../docs/adr/0004-engine-stack.md)).

### 4.7 The site shell

A single-page application with hash-free routes, so every view is a URL:

- `/` — the atlas, full-bleed.
- `/rule/:rule` — one rule, opened in the atlas with the instrument panel.
- `/inspector/:rule` — the Inspector, deep-linked to a seed and a step.
- `/hashlife` — the zoom exhibit with a pattern parameter.
- `/stress` — the stress lab.
- `/verify` — the Verifier (or `/forge` if Forge is chosen).
- `/tour` — the guided tour, chapter in the URL.
- `/methods`, `/limitations`, `/about` — prose pages, rendered from the same Markdown as the repo.

Pages cannot rewrite URLs, so routes use the hash fragment (`/#/rule/B3/S23`) or an
`index.html`-plus-`404.html` trick. The hash is chosen: no 404 dance, no server config, and the state
survives a refresh.

### 4.8 The URL is the state

Every piece of view state that changes what you see lives in the query string, so a view is
reproducible by construction (Section 5.9 defines the schema). The rule is mechanical: if a feature
cannot be restored from a URL, it cannot be exported, and an unexportable view is a bug.

State is versioned with the commit SHA that built the site (`v`). A link generated by an older build
is never silently reinterpreted: if the state schema changed, the site shows the view as "computed with
build X, current schema Y" and offers the nearest valid view.

### 4.9 Build and caching topology

```text
crates -> wasm (wasm-bindgen + wasm-opt) -> site build (Vite) -> static bundle -> Pages
pipeline (native Rust + Python) -> data products + tiles -> committed fixtures / deployed bundle
```

- Assets are content-hashed (`atlas.9f3c1a.js`), because Pages fixes cache headers.
- The WASM binary is a separate, lazily fetched asset so the first paint does not wait for it.
- Data products are fetched by metric layer, not all at once, so the first screen costs one layer.
- The build is reproducible from a clean checkout with a documented command; the manifest records the
  toolchain versions that produced the data.

### 4.10 What is deliberately absent

No backend, no database, no accounts, no cookies, no analytics, no third-party scripts, no CDN
dependencies at runtime, no server-side image generation, no borrowed GPL engine code. Each omission
is a design decision with a reason, and each is asserted by a test or a CI check rather than by
intention.

---

## 5. Data pipeline and products

### 5.1 What the sweep enumerates

The pipeline's job is to turn a rule space into measured, uncertainty-annotated, versioned pixels.

| Family | Space | Method | Cost class |
|---|---|---|---|
| A · Life-like | 262,144 rules (B mask × S mask) | exhaustive, offline | the main sweep |
| B · Lenia-lite | `(mu, sigma)` plane, e.g. 512 × 512 | live in T2, coarse offline pass for the map | GPU or sampled |
| C · Domany-Kinzel | `(p1, p2)` plane, e.g. 256 × 256 | offline, seeded | moderate |

For Family A the sweep is embarrassingly parallel and the unit of work is one rule. Each rule is
simulated from a fixed set of seeds on a torus of stated size, for a stated step budget, and every
metric is computed from those trajectories. The budgets are part of the manifest, so "undecided" always
has a precise meaning: *hit the step cap, the cell cap, or the period-detection cap at these values*.

### 5.2 The per-rule protocol

The same six steps run for every rule, in this order, so results are comparable:

1. **Seed.** Deterministic seed derived from the rule index and a sweep-level salt, never from time.
2. **Transient.** Run `T_warm` steps to leave the initial condition's shadow.
3. **Observation.** Run up to `T_max` steps, sampling the grid at a fixed cadence.
4. **Classify.** Cycle detection (Brent, on a 256-bit state hash) yields transient length and period,
   or *undecided* if the cap is hit.
5. **Measure.** Activity, block entropy, compression ratio, damage spreading and localised-structure
   score are computed on the sampled trajectories.
6. **Quantify.** Bootstrap over seeds gives a mean and a confidence interval per metric.

Two rules of the house apply throughout: **caps produce undecided, never a colour** (ADR 0003), and
**every number ships with its uncertainty** (a metric without a CI is a rendering bug).

### 5.3 Determinism and provenance

A product is reproducible only if four things are pinned: the rule enumeration order, the seeds, the
budgets, and the code. All four live in the manifest, and the manifest's hash is the product version.

```json
{
  "schema": 1,
  "pipeline_version": "0.1.0",
  "git_sha": "…",
  "toolchain": { "rustc": "…", "python": "3.11", "numpy": "…" },
  "space": { "family": "life-like", "count": 262144, "grid": [512, 512],
             "axis": { "x": "birth-mask (Gray)", "y": "survival-mask (Gray)" } },
  "seeds": [11, 23, 37],
  "budgets": { "warm": 64, "max_steps": 1000, "lattice": [64, 64], "period_cap": 4096 },
  "products": [
    { "path": "lifelike_metrics.bin", "sha256": "…", "bytes": 8388608 },
    { "path": "lifelike_classes.bin", "sha256": "…", "bytes": 524288 }
  ]
}
```

The manifest is shipped alongside the products and is what the "reproduce" button points at. If the
manifest is missing, the figure is not publishable.

### 5.4 Binary product formats

All products share one header so a reader does not need a per-file parser (full layout in Appendix B.1).

| Field | Type | Meaning |
|---|---|---|
| `magic` | 4 bytes | `CATL` |
| `version` | u16 | product schema version |
| `dtype` | u8 | 1 = fp16, 2 = f32, 3 = u8 |
| `channels` | u8 | trailing dimension |
| `width`, `height` | u32 | grid dimensions |
| `scale` | f32 | real value = stored value × scale |
| `flags` | u32 | row-major, little-endian, has-NaN |

Little-endian throughout, row-major, no padding. A reader that ignores `version` is a bug: the site
refuses to load a product whose schema it does not know and says so, rather than rendering garbage.

### 5.5 The tile pyramid

The atlas is 512 × 512 rules at the top level, but a retina display and a deep zoom need more. Tiles
are pre-rendered per colouring at levels `z0…z4`, in WebP, with a tile size of 256 px. Rendering is done
in the pipeline (not the browser) so the colouring is exactly the one the manifest describes, and so a
screenshot and the live page cannot disagree.

Tiles are generated per *layer* (class, activity, entropy, uncertainty, disagreement) so switching a
colouring fetches one layer rather than re-rendering the map.

### 5.6 Embeddings (optional, GPU)

The embedding job renders a filmstrip per rule (8 frames × 64 × 64), embeds with a vision model
(DINOv2 or OpenCLIP; check the weights' licence), reduces to 2D with UMAP, and stores a compact vector
for similarity search. Three honest fallbacks, chosen by what the machine can do:

1. **Full job** — all 262k rules on a GPU, hours.
2. **Stratified subsample** — e.g. 32k rules embedded, the rest assigned by k-nearest-neighbour in
   metric space. The artefact records the sample size and the approximation.
3. **Skip** — the alternative layout is absent and the atlas ships the metric space only. Nothing else
   depends on embeddings.

Text-to-rule search is precomputed for an enumerated prompt list. No text model ships to the browser.

### 5.7 Storage budget

| Artefact | Size | Shipped |
|---|---|---|
| `lifelike_metrics.bin` | ~8 MB | lazy, per layer |
| `lifelike_classes.bin` | <1 MB | with first layer |
| `lifelike_embed2d.bin` | ~1 MB | on demand |
| `lifelike_embed_vec.bin` | 8–33 MB | on demand, never in first load |
| tiles | tens of MB | per layer and zoom |
| manifests + golden files | <1 MB | with release |

The whole site stays well inside the Pages limits (1 GB site, soft bandwidth cap), but the *first load*
budget is the one that matters: it must stay under the budget in Section 8, which means the first paint
uses one layer and nothing else.

### 5.8 Golden files

Golden files are committed artefacts that pin behaviour: a 64 × 64 region of metrics for a fixed seed,
a HashLife pattern advanced to a fixed generation, a BB(5) champion tape prefix, a Lenia activation
field. Tests compare against them exactly (discrete) or within tolerance (continuous). When a metric
changes on purpose, the golden file is regenerated in the same commit and the diff is reviewed — that
review is the only place a scientific number can change.

### 5.9 Reproduce URLs

A figure is a URL plus a version hash, never a screenshot:

```text
/#/rule/B3%2FS23?seed=42&steps=256&metric=damage&inst=inspector&palette=class&v=9f3c1a2
```

The export dialogue writes this URL into the PNG/SVG metadata and into a "cite this figure" block that
names the rule, seed, steps, tier, build SHA and the manifest hash. A figure without them is not
publishable (Section 7.7).
---

## 6. Engines and instrument specifications

Each instrument is a deep module: a small interface, a large implementation, and no knowledge of the
others' internals (Section 4.2). This section fixes the interfaces before any code is written, because
these interfaces are what the UI, the tests and the URL schema all depend on.

### 6.1 The instrument contract

Every instrument satisfies the same shape:

```ts
interface Instrument<S> {
  /** Build state from URL parameters; throw a typed error if they are invalid. */
  fromParams(params: URLSearchParams): S;
  /** Serialise state back to URL parameters (lossless round-trip is a test). */
  toParams(state: S): URLSearchParams;
  /** Draw the current state into the given canvas context. */
  render(state: S, ctx: CanvasRenderingContext2D, viewport: Viewport): void;
  /** Handle input; returns the next state and whether the URL should update. */
  onInput(state: S, event: InputEvent): { state: S; dirty: boolean };
}
```

The round-trip property (`fromParams(toParams(s)) ≡ s`) is tested for every instrument with generated
states. That one property is what keeps deep links, exports and bug reports honest.

### 6.2 Atlas

**Interface.** `ruleAt(x, y) → Rule`, `metricsFor(rule) → MetricVector | undefined`, `colourFor(rule,
layer) → RGBA`.

**Implementation notes.**

- The 512 × 512 grid is addressed by Gray-coded masks on both axes, so a one-pixel move is a one-bit
  rule edit. The map is therefore continuous in the only sense that matters: neighbours are minimal
  edits.
- B0 rules (birth on zero neighbours) flicker to full and back. They are evaluated under the standard
  two-step transform and marked with a hatch, so the flicker does not dominate the map.
- Rendering uses the tile pyramid, with the current layer's texture streamed in at the visible zoom.
  At maximum zoom the atlas draws individual rule thumbnails, simulated live in WASM (milliseconds)
  rather than shipped.
- Hover shows the rule in B/S notation, its class, its uncertainty and a "run this rule" button.
  Click opens the instrument panel with the rule already stepping.

**Landmarks.** Conway's Life, HighLife, Seeds, Day & Night, rule 110 (as a 1D insert), rule 30 and
rule 90 are labelled. Labels are data, not code: a small JSON file names the rule, the claim and the
source, so a wrong label is an edit, not a patch.

**Confidence display.** Every pixel carries an agreement score across the independent classifiers
(damage, entropy, cycle, embedding cluster). Pixels where they disagree are the "metric disagreement"
layer, rendered as its own colouring and called out in the UI as the map's headline result rather than
a curiosity.

### 6.3 Inspector

**Interface.** `decompose(rule, seed, steps) → { domains, particles, collisions, complexity }`.

**Implementation notes.**

1. Infer a spatial epsilon-machine (CSSR-style, bounded history length) for the row language.
2. Run the resulting transducer to mask domain-consistent cells; the residue is particles and
   collisions.
3. Compute local causal states on past/future lightcones of depth `h`/`f`, and the local statistical
   complexity per cell.
4. Track connected components through time into world-lines; estimate velocity and period; build the
   collision table.
5. Render raw / filtered / complexity side by side, with the damage-spreading difference field as a
   fourth pane.

**Honesty constraints.** A statistical split is reported with its significance and a bootstrap count
of inferred states; when the state count is unstable, the pane says "inconclusive" instead of drawing
structure. Rule 30 is labelled *no known domain decomposition* and shown as raw spacetime; inventing a
decomposition there would be the single most damaging thing this project could do.

### 6.4 HashLife

**Interface.** `advance(pattern, generations) → pattern`, plus `nodeStats()` for the gauge.

**Implementation notes.**

- Quadtree nodes are hash-consed; each level-`k` node caches its centre `2^(k-1)` square advanced
  `2^(k-2)` generations, which is what makes time exponential per wall-clock second.
- Variable-step advance (`2^j` generations) is standard and is shown in the UI, because the speed-up is
  the exhibit.
- Rendering is level-of-detail: a node smaller than a pixel is drawn as its population density, which
  makes the Life-in-Life structure visible when zooming out.
- The tree view draws the DAG with a sharing ratio (distinct nodes vs nominal cells), making the
  compression visible as a number.
- Arena allocation with generation-based collection, a node cap and a visible memory gauge. Exceeding
  the cap is a visible refusal, not a silent freeze.
- A 4 × 4 leaf lookup table lets other Life-like rules run, so "launch this rule in HashLife" works from
  the atlas.

**Benchmark exhibit.** A deliberate "HashLife-unfriendly" case: a chaotic soup at the same node budget,
documenting the honest slowdown. The exhibit is only convincing if it shows where the algorithm fails.

### 6.5 Stress Lab

**Interface.** `survival(rule, noise, lattice, trials) → { lifetime, ci, survived }`.

**Panels.**

1. **Toom's rule.** Each cell takes the NEC majority (itself, north, east). Below threshold, a stored
   bit persists for times growing with `L`; above, it collapses. A plain majority-of-neighbours control
   is shown beside it, losing the bit at the same noise level.
2. **Domany-Kinzel.** The `(p1, p2)` diagram with the active/absorbing boundary; at criticality the
   density decays as a power law with `δ = 0.159464(6)` in 1+1 dimensions. Measured with error bars and
   a scaling collapse over stated sizes.
3. **Hierarchical error correction.** A concatenated-majority tower, explicitly labelled a pedagogical
   analogue and *not* Gács's construction.
4. **Noise overlay on the atlas.** Re-colour the map at noise ε, so "the map changes with temperature"
   is literally visible.

Citations live on the page: Toom (1970s), Gács (1986, 1989), the 2026 self-correcting QCA preprint, and
the toric-code automaton. The project explains the lineage; it does not implement it.

### 6.6 Forge (signature option A)

**Interface.** `circuit(json) → CellUpdate`, `damage(region)`, `setAsync(bool)`.

**Implementation notes.** Training is offline (JAX/CAX or PyTorch); the browser runs the harvested
circuit bit-sliced. The exhibit is the gap between "learned by gradient descent" and "executes as a
pure Boolean circuit": the hardened circuit is what ships, and a viewer shows each gate's learned
function. Damage and asynchrony are interactive, because resilience is the paper's point. Circuit pruning
is the interpretability exhibit: remove gates, re-measure error, see which ones matter.

**Validation.** The hardened circuit must equal the training-time hard forward pass bit-exactly, and a
Life-recovery circuit must match B3/S23 on all 512 neighbourhood configurations.

### 6.7 Verifier (signature option B)

**Interface.** `decide(machine) → { verdict, certificate? }`, `check(machine, certificate) → boolean`.

**Implementation notes.** Simulators (plain and counter-accelerated), three deciders (cycler, translated
cycler, bouncer), and a **separate** checker that validates certificates by independent replay and shares
no code with the deciders. Outcome classes are `halts(n)`, `certified non-halting`, `heuristically
non-halting`, `undecided`; the UI never collapses the last two.

**Validation.** BB(2..4) by exhaustive search; the BB(5) champion halts at 47,176,870 steps; every
decider's certificates pass the checker on a labelled set and *fail* on mutated ones.

### 6.8 Compiler (stretch) and 6.9 Heritage (stretch)

The Compiler ships in phases — CTS interpreter and visualiser regardless, Rule 110 anatomy with the
Inspector's domain filter, then the encoder — and the decoder-equality test is the gate for phase 3.
Heritage rebuilds the sandpile lab on the shared engine and publishes the statistics toolkit
(log-binned histograms, MLE power-law fits with goodness-of-fit, finite-size collapse, bootstrap CIs),
with the original biased fit shown beside the corrected one.

### 6.10 Composition

Instruments compose through rule identity and the URL, never through shared mutable state:

```text
atlas ──click──► inspector(rule)
   │                 └──"send to hashlife"──► hashlife(pattern)
   └──"this rule under noise"──► stress(rule, ε)
```

Each arrow is a URL, which means each arrow is also a test case.

---

## 7. Frontend and interaction

### 7.1 Rendering model

Canvas 2D is the floor and the default: the atlas is a textured quad with a tile pyramid, the
instruments are 2D grids, and 60 fps at 1080p on integrated graphics is achievable without WebGL.
WebGPU is used only where it earns its complexity (Lenia-lite, large grids, dense overlays) and always
with a 2D fallback that draws the same thing more slowly.

Rendering is **immediate-mode with a retained cache**: each frame redraws from state, but layers
(tiles, decoded products, instrument panes) are cached by key and invalidated on state change. That
keeps the code free of a scene graph while avoiding redundant work.

### 7.2 Camera and interaction

- Pan and zoom are direct manipulation (drag, wheel, pinch), with a zoom that is exponential in wheel
  delta so it feels linear in perceived scale.
- Zooming into the atlas from level 0 to a single rule is continuous: tiles at low zoom, individual
  cells at high zoom, no mode switch.
- Keyboard: arrows pan, `+`/`-` zoom, `Home` resets, `Tab` walks the instrument panel, `Enter` opens a
  selected rule, `Esc` closes. Every pointer interaction has a keyboard equivalent.
- `prefers-reduced-motion` disables the tour's transitions and any automatic stepping.
- Touch: one finger pans, two fingers pinch; long-press is hover.

### 7.3 Information architecture

The chart is the interface, so the chrome is minimal: a status bar (tier, zoom, rule under cursor), a
layer selector, an instrument drawer, and a tour button. The prose pages exist, but they are reached
from the map, not in front of it.

### 7.4 The guided tour: six chapters

The tour is a state machine over the same instruments, not a separate build. Each chapter sets the
atlas state, animates the change, and offers "take over" to drop into free exploration.

| # | Chapter | State it sets | What it establishes |
|---|---|---|---|
| 1 | **The map** | atlas, class layer, zoom 0 | every pixel is a rule; colour is behaviour |
| 2 | **The coastline** | zoom to a boundary, disagreement layer | the boundary is intricate at every scale, and classifiers disagree there |
| 3 | **Inside a rule** | inspector on rule 110 (and 30 as contrast) | computation is moving structure; some structure is unknown |
| 4 | **Life inside Life** | hashlife, metapixel pattern | an algorithm can be the visual |
| 5 | **Noise** | stress lab, then atlas at ε | reliable computation is a phase, not a binary |
| 6 | **The edge of knowledge** | verifier or forge | undecided is a legitimate outcome |

Chapter 6 is written twice, once per signature module, and only the chosen one ships.

### 7.5 Colour and encoding

- **Classes** use a perceptually ordered palette (frozen → periodic → chaotic → computational), checked
  against deuteranopia and protanopia simulations, and never relied on alone: every class also has a
  texture or a label.
- **Undecided** is a hatch, not a colour, so it cannot be mistaken for "chaotic" in a screenshot.
- **Uncertainty** is an alpha overlay, so a high-variance pixel reads as faint rather than confident.
- **Disagreement** is its own layer with a diverging palette centred on "classifiers agree".
- Every layer's legend is generated from the same data that renders it, so a legend cannot drift.

### 7.6 Type and shell

System font stack, one accent colour, no icon fonts (inline SVG), no webfont download in the first
paint. The shell is ~10 KB of HTML and CSS; everything else is code.

### 7.7 Export

Export writes PNG at 2× device pixels with metadata (rule, seed, steps, tier, build SHA, manifest hash)
plus a "cite this figure" block and the reproduce URL. SVG export is offered where the figure is
vector-native (Inspector panes, tree view, phase diagrams). Copy-link is a first-class button on every
instrument.

### 7.8 Accessibility

Lighthouse accessibility ≥ 95, keyboard-complete, focus visible, canvas content mirrored by a text
summary (rule, class, metrics, uncertainty) in the DOM for screen readers, live regions for stepping
status, and no colour-only encoding. The atlas is a canvas, so the equivalent table view is not
optional: it is the accessible representation of the same data.

### 7.9 Workers and state

Simulation runs in Web Workers so input never blocks. Since there is no `SharedArrayBuffer` on Pages
(Section 4.1), the worker receives a command and returns a packed grid buffer, transferred rather than
copied. State lives in one store keyed by URL parameters; workers are stateless between commands, which
keeps determinism testable.
---

## 8. Performance budgets and measurement

Performance is a product requirement here, not a polish step: the atlas is the hero, and a hero that
stutters is a failed exhibit.

### 8.1 Budgets

| Metric | Budget | Measured on | Consequence of failure |
|---|---|---|---|
| LCP (atlas visible and interactive) | ≤ 2.5 s | mid-range laptop, 4× CPU throttle, 4G profile | cut the default layer's weight before merging |
| Pan/zoom frame time | ≤ 16.7 ms (60 fps) | 1080p, integrated GPU | reduce tile size or LOD threshold |
| Rule startup (click → first frame) | ≤ 50 ms | WASM tier, 256 × 256 torus | pre-warm the worker |
| First-load transfer | ≤ 2 MB compressed | cold cache | defer a layer |
| WASM binary | ≤ 1.5 MB compressed | `wasm-opt -O3` | split the engine by feature |
| Peak WASM memory | ≤ 512 MB soft cap, visible gauge | HashLife at node cap | lower node cap, show refusal |
| Long task on interaction | none > 100 ms | main thread | move work to a worker |

These are budgets, not measurements. The first CI run that can measure them is what makes them real;
until then they are targets with the same status as Section 1.3.

### 8.2 How each is measured

- **LCP and transfer size** from Playwright + `PerformanceObserver` on a throttled profile in CI
  (Lighthouse CI for the trend, the observer for the gate).
- **Frame time** from a scripted pan over one second of travel, reporting the 95th-percentile frame.
- **Rule startup** from `performance.mark` around the worker round-trip.
- **Memory** from `performance.measureUserAgentSpecificMemory()` where available, else the engine's own
  allocator counter, which is the number that matters for the node cap anyway.

Measurements run on a fixed CI runner and are noisy; the gate is a **10% regression against the stored
baseline**, not an absolute number, and the baseline is committed with the run's build SHA.

### 8.3 The workloads that count

1. Atlas at zoom 0 with the class layer (the front door).
2. Atlas deep-zoomed into a coastline with 64 live thumbnails (the worst case for tile fetching).
3. HashLife on the metapixel at maximum step size (the best case for the algorithm).
4. HashLife on a chaotic soup at the same node budget (the honest worst case).
5. Inspector on rule 110 at 512 × 512 (the heaviest analysis).
6. Stress lab at 1024² × 1000 trials (the heaviest Monte Carlo).

A change that improves 3 and degrades 4 is not a win; the pair is what the exhibit claims.

### 8.4 Degradation ladder

When the budget is at risk, the order of sacrifice is fixed in advance: drop the embedding layer, then
the disagreement overlay, then tile resolution, then live thumbnails, then the instrument panes'
animation. Correctness and classification are never sacrificed; only resolution and rate.

---

## 9. Validation and testing

### 9.1 Test pyramid

| Level | What it proves | Tool | Runs |
|---|---|---|---|
| Unit | rule encodings, Gray code, cycle detection, format writers | pytest / cargo test / vitest | every push |
| Property | canonicalisation, glider translation, URL round-trip | proptest / fast-check | every push |
| Golden | metrics, HashLife generations, BB(5) tape, Lenia field | committed fixtures | every push |
| Differential | WASM vs native vs TS reference, bit-exact | harness in `tests/` | every push |
| Integration | atlas → inspector → URL → export | Playwright | PR to `main` |
| Statistical | nulls, false-positive rates, CI coverage | pytest | weekly |
| Performance | Section 8 budgets | Playwright + Lighthouse CI | PR to `main` |

### 9.2 Validation targets

Every number below has a source and a tolerance. A target without one is not a target.

| # | Claim | Value | Source | Tolerance |
|---|---|---|---|---|
| V1 | Life still lifes and gliders | period/translation exact | standard patterns | exact |
| V2 | Rule 90 pattern | Pascal's triangle mod 2 | elementary | exact |
| V3 | Rule 18 domain | `(0Σ)*` | computational-mechanics literature | structural match |
| V4 | Rule 110 ether | published spatial/temporal period | Cook / Wolfram, to be fixed at M2 | exact once fixed |
| V5 | BB(2), BB(3), BB(4) | 6, 21, 107 steps | exhaustive search | exact |
| V6 | BB(5) champion | halts after 47,176,870 steps | bbchallenge, arXiv:2509.12337 | exact |
| V7 | DP decay exponent (1+1D) | `δ = 0.159464(6)` | DP universality literature | fit within stated error at stated sizes |
| V8 | DP order parameter | `β = 0.276486(8)` | as above | as above |
| V9 | Toom lifetime vs `L` | grows below threshold, collapses above | Toom (1970s) | qualitative + monotone CIs |
| V10 | Forge Life recovery | all 512 neighbourhoods | B3/S23 | exact |
| V11 | HashLife vs naive | N generations, random soups | own reference | bit-exact |
| V12 | Lenia tier agreement | activation field | own reference | 1e-4 |
| V13 | Null spacetimes | no spurious particles | shuffled-time null | stated false-positive rate |

V4 is deliberately marked "to be fixed": the doc previously carried a placeholder ether period, and the
verification pass could not source it. The M2 acceptance criterion is to fix the value from Cook (2004)
or Wolfram's tables and then pin it as a golden test — not to guess it now.

### 9.3 Differential testing protocol

Three implementations exist for discrete rules: native Rust, the same crate as WASM, and the TypeScript
CPU fallback. The harness runs all three from a shared corpus — random soups, named patterns, every
rule on a small torus — for a fixed number of generations and compares **state digests**, not
screenshots. Any mismatch fails the build and names the tier, the rule, the seed and the generation.

Continuous rules (Lenia-lite) are compared only WebGPU vs fixed CPU reference, with the 1e-4 tolerance,
and the comparison is reported as a difference distribution rather than a pass/fail, because a
last-bit divergence is informative and a large one is a bug.

### 9.4 Statistical validation

Three tests keep the inference honest:

1. **Null spacetimes.** Time-shuffled fields must produce no particles above the stated false-positive
   rate. If they do, the detector is measuring noise.
2. **Bootstrap coverage.** For a synthetic process with known parameters, the bootstrap CI must cover
   the truth at approximately the nominal rate. If it does not, the CI is decorative.
3. **Caps are visible.** The undecided fraction is measured and reported per layer; a layer whose
   undecided mass exceeds the stated bound is not shipped as a classification.

### 9.5 CI gates

```text
push ──► lint + unit + property + golden + differential (fast, < 5 min)
PR ────► above + build the site + Playwright smoke + Lighthouse budget check
main ──► above + publish to Pages + manifest check
weekly ► statistical suite + performance trend
```

A red differential test blocks merge. A performance regression blocks merge at > 10% against baseline.
A statistical-suite failure blocks the next data release, not a code merge, because data and code have
different release cadences (Section 10.4).

### 9.6 Mutation testing for certificates

The Verifier's checker is validated by mutation as well as by acceptance: flip a cycle period, shift a
translation vector, perturb a bouncer parameter, truncate the tape. Every mutation must be rejected, and
the checker must never share code with the decider that produced the certificate. The mutation suite is
what makes "certified" mean something.

---

## 10. Deployment and operations

### 10.1 The pipeline

```text
merge to main
  ├─ CI: lint, test, differential, build
  ├─ build site (content-hashed assets)
  ├─ publish to gh-pages via Actions (single commit, no history)
  └─ verify: fetch the published URL, assert the build SHA in the footer
```

Publishing to `gh-pages` from Actions (rather than Pages' branch build) gives one atomic deploy per
merge and a build log you can read. The footer carries the build SHA, so "which version am I looking at"
is answerable from a screenshot.

### 10.2 Hosting constraints, restated as operations

- No custom headers → CSP via `<meta>`, no COOP/COEP, no `SharedArrayBuffer`.
- Fixed cache headers → content-hashed filenames, and data products fetched by manifest hash.
- 1 GB site, soft bandwidth cap → the site stays in the tens of MB; products are lazy.
- `404.html` exists and renders the app shell, so a deep link to an unknown path still works.
- The site must function with the base path of a project page (`/chaotic-automata/`), not just a domain
  root; this is a build-time constant and a test.

### 10.3 Free fallbacks

If Pages is unavailable or a preview deploy is needed, the same static bundle works on any static host
(Cloudflare Pages, Netlify, S3+CloudFront). The build emits a host-agnostic artefact; the only
host-specific pieces are the base path and the deploy step. This satisfies the "free fallbacks" promise
in the header without adding a second deployment pipeline to maintain.

### 10.4 Release cadence

Two independent streams:

- **Site releases** — every merge to `main`, versioned by build SHA; no semantic versioning needed.
- **Data releases** — when the sweep or a metric changes; tagged `data-vN`, with the manifest and golden
  files in the same tag, so a figure from `data-v3` can still be reproduced after `data-v4` ships.

Keeping them separate is what prevents "we shipped a new site" and "we changed a scientific number" from
being the same event.

### 10.5 Operations without a backend

No servers means no server metrics, so observability is synthetic:

- A post-deploy check fetches the published page, asserts the build SHA and a canvas render marker.
- A weekly scheduled workflow repeats it, so a broken Pages configuration is noticed.
- Client errors are not collected (no telemetry by design); bug reports carry the build SHA from the
  footer, which is the substitute.
- Rollback is re-running the workflow on the previous merge commit; `gh-pages` history is one commit, so
  there is nothing to unwind.

### 10.6 Documentation and the repo

`docs/`, the wiki and the in-app methods/limitations pages describe the same facts and are checked
against each other in review. The wiki is the readable tour; `docs/` is authoritative; the app renders
its prose pages from the same Markdown so a published claim cannot be edited in only one place.
---

## 11. Schedule, scope and cut lines

### 11.1 Milestones

Estimates are in focused developer-weeks for one person, and they are estimates, not commitments.

| Milestone | Modules | Effort | Exit criterion | Depends on |
|---|---|---|---|---|
| **M0 · Foundations** | platform | 1–2 wk | engine stack chosen by measurement; two implementations agree bit-exactly; CI builds and publishes; docs live | — |
| **M1 · Atlas** | M1 | 4–6 wk | 512×512 map loads in ≤ 2.5 s LCP; 60 fps pan/zoom; disagreement layer shipped; landmarks in expected regions | M0 |
| **M2 · Inspector** | M2 | 3–4 wk | V2–V4 pass; nulls clean at the stated rate; inconclusive labelling works | M0, M1 (for the URL/UI shell) |
| **M3 · HashLife** | M3 | 3–4 wk | V11 bit-exact; golden generations pass; metapixel zoom; memory gauge and node cap enforced | M0 |
| **M4 · Stress Lab** | M4 | 2–3 wk | V7–V9 within tolerance; overlay re-colours the atlas | M1 |
| **M5 · Signature module** | M5a or M5b | 4–6 wk | V6 / V10 exact; mutation suite rejects corrupted certificates | M1 |
| **M6 · Compiler** *(stretch)* | M6 | 4–6 wk | decoder equals the CTS reference; else ship "Rule 110 anatomy" | M2 |
| **M7 · Heritage** *(stretch)* | M7 | 1–2 wk | sandpile statistics reproduced with log-binned MLE; biased fit shown beside it | M0 |

The spine — M0, M1, M2, M3, M4, one of M5 — is roughly 18–25 developer-weeks. M6 and M7 are outside
that number by construction.

### 11.2 Order and critical path

```text
M0 ──► M1 ──► M4
 │      ├────► M2 ──► (M6)
 │      └────► M5
 └────► M3
```

- **M0 first, always.** The engine spike decides the representation for the sweep. Doing it late means
  rewriting the sweep, which is the most expensive possible ordering.
- **M1 before the instruments.** The atlas is the hero and the fastest path to something demoable; every
  instrument reuses its engine, URL state and rendering.
- **M3 in parallel.** HashLife is purely algorithmic and independent of the data products, so it can
  interleave with the sweep without contention.
- **M4 after M1**, because its overlay is a re-colouring of an existing map.
- **M5 last**, because it is the most research-shaped work and the most likely to slip. Scheduling it
  last means a slip costs the signature module, not the spine.

### 11.3 Weekly cadence

One milestone in flight at a time on the project board; issues are the queue, one branch per issue, one
PR per branch, squash-free merge commits so the history reads as the work happened. Every PR restates
its acceptance criteria and links the issue it closes. The board's `Module`, `Priority` and `Status`
fields are the live state; a stale field is a process bug, not a documentation gap.

### 11.4 Definition of done, per milestone

A milestone is done when all five hold:

1. Its validation targets (Section 9.2) pass in CI, not on a laptop.
2. Its instrument has a URL that restores the view exactly (round-trip test).
3. Its figures export with seed, tier, build SHA and manifest hash.
4. Its methods and limitations text is written, in the repo and in the app.
5. Its performance workload is inside budget, or the degradation ladder has been applied deliberately.

### 11.5 Cut lines, in order

Cutting is planned, not improvised. The order is fixed so a slip is a decision rather than a surprise.

1. **M6 Compiler** → phases 1–2 only ("Rule 110 anatomy"). The encoder is the part that requires exact
   glider spacings from Cook's construction; the anatomy exhibit still shows the ether.
2. **M7 Heritage** → a short page using the statistics toolkit, no engine migration.
3. **Lenia-lite** → ship the discrete atlas only; the continuous plane becomes a documented extension.
4. **Foundation-model embedding** → ship the metric space; drop the alternative layout.
5. **Disagreement layer** → last resort, and the one cut that weakens the thesis, because metric
   disagreement is the project's own contribution. If it goes, the README must say so.

### 11.6 Explicitly not scheduled

Flow-Lenia mass conservation, spatially resolved Lyapunov profiles, 2D computational-mechanics
reconstruction, full BB(6) decider coverage, accounts, a backend, and any form of telemetry.

---

## 12. Risks, decisions and open questions

### 12.1 Risk register

| ID | Risk | Likelihood | Impact | Mitigation | Trigger to act |
|---|---|---|---|---|---|
| R1 | The 262k-rule sweep is too slow | medium | high | SWAR/GPU first; early benchmark in M0; stratified subsample fallback | sweep > 24 h on the reference machine |
| R2 | WASM memory blows up in HashLife | medium | high | arena + generation GC, node cap, visible gauge | peak > 512 MB |
| R3 | Causal-state inference finds structure in noise | medium | high | null tests, significance-tested splits, "inconclusive" state | null false-positive rate above stated bound |
| R4 | HashLife degrades to naive speed on chaotic soups | high | low | make it an exhibit, not a hidden failure | always |
| R5 | DP exponent fit misses at available sizes | medium | medium | error bars + scaling collapse; report a miss as a miss | fit outside tolerance at 3 sizes |
| R6 | Forge training does not converge in time | medium | medium | ship checkpoints; training is offline; 4–8 model zoo | no Life recovery after budget |
| R7 | Verifier scope creeps into a re-proof | high | medium | three deciders only; method, not proof | a fourth decider proposed |
| R8 | Pages cannot serve the app's needs (headers, size) | low | high | hash routing, hashed assets, lazy layers, host-agnostic bundle | base-path or header failure in CI |
| R9 | GPL contamination from a borrowed engine | low | high | black-box oracles only; dependency licence check in CI | any GPL crate or vendored file appears |
| R10 | Embeddings exceed the page budget or need a GPU we lack | medium | low | subsample + kNN, or skip embeddings | product > 33 MB or no GPU |
| R11 | Signature module slips | high | medium | scheduled last; spine ships without it | M5 exceeds its estimate by 50% |
| R12 | Tier divergence from SIMD/fp16 differences | medium | high | differential gate, deterministic integer paths, fp16 only for display | any digest mismatch |

R4 and R11 are the two risks that are *expected*: the design assumes them rather than pretending
otherwise.

### 12.2 Decision log

| ADR | Decision | Status |
|---|---|---|
| [0001](../docs/adr/0001-static-serverless-client-side.md) | Static, serverless, client-side only | accepted |
| [0002](../docs/adr/0002-two-implementations-differential-testing.md) | Two implementations, differential testing, no GPL engine code | accepted |
| [0003](../docs/adr/0003-undecided-first-class-outcome.md) | Undecided is a first-class outcome | accepted |
| [0004](../docs/adr/0004-engine-stack.md) | Rust→WASM bit-packed engines; TypeScript `u8` as the reference floor | accepted, from measurement |
| — | Site framework (Vite + vanilla TS vs framework) | open, leaning vanilla |
| — | Licence | open, tracked in the tracker |
| — | Ship embeddings or not | open, decided after the M1 sweep |

An ADR is written when a decision is made, not after the fact, and the design document links to it
rather than restating it. The three accepted ADRs are the ones that would be expensive to reverse.

### 12.3 Open questions

Each question has an owner-by-role and the milestone that must answer it.

| Question | Resolved by |
|---|---|
| Which engine stack wins on startup and stepping cost? | **resolved**: ADR 0004 |
| Does the atlas stream extra metric layers, or ship one per load? | M1 measurement |
| How are embeddings shipped within the page budget? | M1 sweep result |
| Are PR preview builds possible on Pages under current settings? | M0 deployment check |
| What tolerance defines "classifiers agree" in the disagreement layer? | M1, calibrated against the null |
| Which palette survives deuteranopia and protanopia simulation? | M1 accessibility pass |
| Is the Rule 110 ether period what the literature says? | M2 (V4) |
| Does the OTCA metapixel's footprint match the quoted figure? | M3, read from the RLE at import |
| Is the Antihydra machine string correct? | M5b, checked against the bbchallenge wiki |

The last three are the placeholders carried over from the earlier draft; the citation-verification pass
recorded exactly why each is still open (Appendix D).

---

## Appendix A. Code skeletons

Skeleton-level and untested by design (see the note at the top of this document). They fix the shape of
the interfaces, not their implementation.

### A.1 Rule encoding and Gray code

```python
# src/computation_atlas/rules/lifelike.py
from dataclasses import dataclass

HALF = 9  # bits needed for a neighbourhood count 0..8

@dataclass(frozen=True)
class LifeLike:
    birth: int      # bitmask over counts 0..8
    survival: int   # bitmask over counts 0..8

    @property
    def index(self) -> int:
        """0..262143, x = birth, y = survival, both Gray-coded for axis locality."""
        return (gray_encode(self.birth) << HALF) | gray_encode(self.survival)

    @classmethod
    def from_index(cls, index: int) -> "LifeLike":
        return cls(gray_decode(index >> HALF), gray_decode(index & ((1 << HALF) - 1)))

    def apply(self, count: int, alive: bool) -> bool:
        mask = (self.survival if alive else self.birth)
        return bool(mask >> count & 1)


def gray_encode(value: int) -> int:
    return value ^ (value >> 1)


def gray_decode(value: int) -> int:
    result = 0
    while value:
        result ^= value
        value >>= 1
    return result
```

### A.2 Bit-sliced stepper

```rust
// crates/ca-core/src/stepper.rs  (skeleton)
pub struct Stepper {
    width: usize,
    height: usize,
    cells: Vec<u64>, // one bit per cell, packed row-major
}

impl Stepper {
    /// Advance one generation on a torus. `rule` is the 18-bit Life-like encoding.
    pub fn step(&mut self, rule: u32) {
        let mut next = vec![0u64; self.cells.len()];
        for y in 0..self.height {
            for x in 0..self.width {
                let n = self.neighbour_count(x, y);
                let alive = self.get(x, y);
                let bit = 1u64 << (x & 63);
                if (rule >> (9 * alive as u32 + n)) & 1 == 1 {
                    next[y * self.row_words() + x / 64] |= bit;
                }
            }
        }
        self.cells = next;
    }

    fn neighbour_count(&self, x: usize, y: usize) -> u32 { unimplemented!() }
    fn get(&self, x: usize, y: usize) -> bool { unimplemented!() }
    fn row_words(&self) -> usize { (self.width + 63) / 64 }
}
```

### A.3 Metric API

```python
# src/computation_atlas/metrics/api.py
from dataclasses import dataclass

@dataclass(frozen=True)
class Estimate:
    value: float
    ci_low: float
    ci_high: float
    samples: int

def activity(frames, window: int) -> Estimate: ...
def block_entropy(frames, block: int) -> Estimate: ...
def compression_ratio(frames, codec: str = "deflate") -> Estimate: ...
def damage_spreading(rule, seeds, lattice, steps) -> Estimate: ...
def localised_structures(frames, min_lifetime: int) -> Estimate: ...
def undecided_mass(results) -> float: ...
```

Every metric takes frames or a rule and returns uncertainty; no metric returns a bare number, which is
what makes "every figure carries uncertainty" a property of the type system rather than a promise.

### A.4 Manifest writer

```python
# src/computation_atlas/sweep/manifest.py  (skeleton)
def write_manifest(path, *, space, seeds, budgets, products, toolchain) -> str:
    payload = {
        "schema": 1,
        "git_sha": git_sha(),
        "toolchain": toolchain,
        "space": space,
        "seeds": seeds,
        "budgets": budgets,
        "products": [
            {"path": p.name, "sha256": sha256(p), "bytes": p.stat().st_size}
            for p in products
        ],
    }
    path.write_text(json.dumps(payload, indent=2, sort_keys=True))
    return hashlib.sha256(path.read_bytes()).hexdigest()
```

---

## Appendix B. Wire formats and schemas

### B.1 Product header

```text
offset  size  field      notes
0       4     magic      "CATL"
4       2     version    u16, schema version; unknown version is refused
6       1     dtype      1 = fp16, 2 = f32, 3 = u8
7       1     channels   trailing dimension, >= 1
8       4     width      u32, cells
12      4     height     u32, cells
16      4     scale      f32; real = stored * scale
20      4     flags      bit 0 row-major, bit 1 little-endian, bit 2 contains NaN
24      ...   payload    width * height * channels * sizeof(dtype)
```

A reader must validate `magic`, `version`, `dtype` and the payload length before allocating; a truncated
download is a typed error, not a partially rendered map.

### B.2 Certificate schema (Verifier)

```json
{
  "schema": 1,
  "machine": "1RB1LA_---0RB",
  "decider": "translated-cycler",
  "verdict": "non-halting",
  "evidence": { "translation": [0, 2], "cycle_start": 41, "period": 3 },
  "checker": "checker-v1",
  "steps_checked": 128
}
```

The checker re-derives the evidence from the machine and rejects anything it cannot reproduce. The
`decider` and `checker` fields exist so a UI can show *who* claims and *who* verified, which is the
whole point of the exhibit.

### B.3 URL state schema

| Parameter | Type | Meaning |
|---|---|---|
| `v` | hex | build SHA that produced the site |
| `rule` | string | rule identifier (`B3/S23`, `elem:110`, `lenia:mu,sigma`) |
| `seed` | uint32 | RNG seed for the live run |
| `steps` | uint32 | generations shown |
| `metric` | enum | atlas layer |
| `inst` | enum | instrument (`atlas`, `inspector`, `hashlife`, `stress`, `verify`, `forge`) |
| `tier` | enum | override the detected tier |
| `x`, `y`, `z` | floats | camera |
| `eps` | float | noise rate |
| `pat` | string | named HashLife pattern |

Unknown parameters are ignored rather than fatal, so old links keep working; unknown *values* for a
known parameter produce the nearest valid view plus a notice.

### B.4 Golden file layout

```text
tests/fixtures/
  metrics/64x64_B3S23_seed42.json      # values + CI + manifest hash
  hashlife/glider_gun_gen2^10.rle
  verifier/bb5_champion_tape_prefix.bin
  lenia/activation_mu0.15_sigma0.017.f32
  manifest.json                        # hashes of all of the above
```

Golden files are regenerated only with a documented command, in a commit whose message says which
number moved and why.

---

## Appendix C. References

Verified 18 November 2026 against primary sources; see Appendix D for the corrections this check
produced.

1. Kumar, D. et al. *Automating the Search for Artificial Life with Foundation Models.*
   arXiv:2412.17799.
2. Miotti, A., Niklasson, E., Randazzo, E., Mordvintsev, A. *Differentiable Logic Cellular Automata.*
   arXiv:2506.04912.
3. Faldor, M., Cully, A. *CAX: Cellular Automata Accelerated in JAX.* arXiv:2410.02651.
4. bbchallenge Collaboration. *Determination of the fifth Busy Beaver value.* arXiv:2509.12337
   (STOC 2026). The proof was completed in 2024; the formalisation is in Rocq (formerly Coq).
5. Rupe, A., Crutchfield, J. P. *Local Causal States and Discrete Coherent Structures.*
   arXiv:1801.00515.
6. Balasubramanian, Davydova, Lake. *A local automaton for the 2D toric code.* arXiv:2412.19803,
   Quantum **10**, 2125 (2026).
7. Dünnweber, Styliaris, Trivedi. *Quantum Memory and Autonomous Computation in Two Dimensions.*
   arXiv:2601.20818 (2026).
8. Toom, A. L. *Stable and attractive trajectories in multicomponent systems* (1974) and later work on
   reliable storage by local rules.
9. Gács, P. *Reliable computation with cellular automata* (1986); *Self-correcting self-assembly*
   (1989 and later).
10. Cook, M. *Universality in Elementary Cellular Automata* (2004).
11. Wolfram, S. *A New Kind of Science* (2002) — rule 30, rule 110, elementary rule tables.
12. Crutchfield, J. P., Young, K. *Inferring statistical complexity* (1989); Shalizi, C., Shalizi, K.
    *Local complexity filtering* (2004).
13. Bagnoli, F. et al. on damage spreading in CA; Baetens & Gravner on spatially resolved Lyapunov
    profiles.
14. Langton, C. *Computation at the edge of chaos* (1990), and the 1993 re-examination that qualifies
    the lambda interpretation.
15. Golly — open-source Life simulator, GPL-2.0-or-later; used as a black-box oracle only.

---

## Appendix D. Citation verification log

The full table, with what each source actually says and which claims needed correction, is in
[`docs/research/design-doc-review.md`](../docs/research/design-doc-review.md). Summary of what changed
in this document as a result:

| Claim in an earlier draft | Verified position |
|---|---|
| DP decay exponent "about 0.16" | `δ = 0.159464(6)` in 1+1D; `β = 0.276486(8)`; `ν∥ = 1.733847(6)` |
| BB(5) paper dated 2024 | arXiv:2509.12337 is 2025; the *proof* is 2024, the formalisation in Rocq |
| "Coq" | The tool is now Rocq; the project name in the paper is Coq-BB5 |
| Toric-code automaton "preprint" | Published in Quantum **10**, 2125 (2026) |
| OTCA metapixel "2058 × 2058" | Unverified; read the footprint from the pattern at import (R12 open question) |
| Rule 110 ether periods | Unverified placeholder; fixed at M2 and pinned as a golden test (V4) |
| Antihydra machine string | Unverified; checked against the bbchallenge wiki before display |
| Rule 30 "no known decomposition" | Open claim; phrased as "no published decomposition" and shown as open |
| Lenia chart constants | Unverified; treated as parameters to be calibrated, not quoted values |

A claim moves out of this table only by being sourced, and the source goes in Appendix C. That is the
rule the verifier applied to the earlier draft, and it is the rule this appendix exists to make visible.
