# Computation Atlas

**A navigable map of the space of simple programs** — showing where order ends, chaos begins, and
computation lives in between.

Every pixel of the atlas is a different cellular automaton, coloured by what it *does* (frozen,
periodic, chaotic, capable of computation), with visible "coastlines" where behaviour changes
character. Any point can be run live, and opened in instruments that look *inside* the rule: domains
and particles, a HashLife zoom where Life runs inside Life, and a noise lab where reliable
computation either survives or dies.

| | |
|---|---|
| **Status** | The atlas is live: a 512×512 map of rule space with class and metric colourings, hatching for undecided rules, a disagreement layer, landmark labels and click-to-run. Data comes from the pipeline's preview sweep. |
| **Design** | [`source/Computation_Atlas_v2_Design_Doc.md`](source/Computation_Atlas_v2_Design_Doc.md) — draft 2, sections 0–12 plus appendices |
| **Deliverable** | Static, serverless web app on GitHub Pages, plus a reproducible offline data pipeline |
| **Audience** | Admissions committees, research-software hiring managers, computational physics / ML-for-science teams |

> The design is complete: architecture, data products, instrument interfaces, frontend, performance
> budgets, validation targets, deployment, schedule, risks and appendices. [`docs/architecture.md`](docs/architecture.md)
> is the short summary for day-to-day work; the design document is authoritative.

## Why it is not a demo

1. **Frontier methods used for real**, not name-dropped: foundation-model illumination of rule space
   (ASAL), differentiable logic CA, certificate-carrying Busy Beaver deciders, hierarchical
   fault-tolerant CA, local causal states.
2. **Scientific honesty as a feature.** Competing complexity metrics are shown side by side,
   undecidable cases get an explicit *undecided* class, every figure carries seed, version and a
   reproduce link.
3. **Serious engineering.** Rust→WebAssembly engines, WebGPU compute with a fallback ladder, a
   validation suite against published results, differential testing (GPU vs CPU vs reference), and
   CI-driven static deployment.
4. **The chart is the interface.** The hero is the live atlas.

## Modules

| Tier | Module | One-liner |
|---|---|---|
| Core | **M1 Atlas** | Zoomable map of rule space with multiple colourings |
| Core | **M2 Inspector** | Domains, particles and local complexity for 1D CA |
| Core | **M3 HashLife Zoom** | Infinite zoom in space and time through Life |
| Core | **M4 Stress Lab** | Noise, Toom's rule, directed percolation, hierarchical error correction |
| Signature (pick one) | **M5a Forge** | Learn discrete CA rules by gradient descent |
| Signature (pick one) | **M5b Verifier** | Decide Turing machines with checkable certificates and an *unknown* class |
| Stretch | **M6 Compiler** | Compile a cyclic tag system into a Rule 110 initial condition |
| Stretch | **M7 Heritage** | The original sandpile lab rebuilt on the shared engine |

Recommended spine: **M1 + M2 + M3 + M4 + one of M5a/M5b**. M6 and M7 are cut lines; see
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Repository map

```text
source/
  Computation_Atlas_v2_Design_Doc.md   # the design (sections 0–12 + appendices)
  python/                              # legacy sandpile lab — heritage (M7), not yet migrated
src/computation_atlas/                 # offline data pipeline (Python)
tests/                                 # pipeline tests
crates/                                # Rust engine workspace: ca-core, ca-wasm (ADR 0004)
site/                                  # TypeScript app: Vite, canvas, URL state
docs/
  architecture.md                      # short architecture summary
  methods.md                           # scientific methods, constants and citations
  limitations.md                       # what this cannot show, and why
  ROADMAP.md                           # milestones, spine and cut lines
  research/design-doc-review.md        # citation verification and gap analysis
  adr/                                 # architecture decision records
  agents/                              # issue tracker, triage labels, domain doc rules
.agents/skills/                        # local engineering skills used by coding agents
.github/workflows/                     # CI
```

## Getting started

Python 3.11+ is required for the offline pipeline.

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv/Scripts/activate
pip install -e ".[dev]"
pytest -q
ruff check .
```

The engine and the site have their own toolchains:

```bash
cargo test --workspace                    # packed engine vs the u8 reference, bit-exact
cd site
npm install
npm run build:wasm                        # optional; without it the site uses the CPU reference
npm run dev                               # http://127.0.0.1:5173/?rule=B3/S23&seed=1
npm run typecheck && npm test              # site unit tests
npm run e2e                               # headless smoke test (npx playwright install chromium first)
```

The legacy sandpile lab is separate and self-contained:

```bash
cd source/python
pip install -r <(pipenv requirements)   # or install numpy/scipy/matplotlib directly
python main.py
```

It writes plots into `Grids/`, `Histograms/`, `Line_Plots/` and `Log_Plots/`.

## Engineering standards

- **Two implementations, one truth.** Every engine is checked against an independent reference
  (see [ADR 0002](docs/adr/0002-two-implementations-differential-testing.md)); GPU and CPU tiers must
  agree bit-for-bit on deterministic rules.
- **Determinism.** Every artefact records rule, seed and version hash. A figure without a reproduce
  link is a bug.
- **Undecided is a result.** Budget caps produce *undecided*, never "chaotic" (see
  [ADR 0003](docs/adr/0003-undecided-first-class-outcome.md)).
- **No borrowed engines.** Golly and other GPL implementations are black-box oracles for tests only;
  their code stays out of the repo.

## Documentation

| Document | Use it for |
|---|---|
| [`docs/methods.md`](docs/methods.md) | Algorithms, verified constants, citations |
| [`docs/performance.md`](docs/performance.md) | Measured load and frame time on the deployed build |
| [`docs/limitations.md`](docs/limitations.md) | Honest scope and failure modes |
| [`docs/architecture.md`](docs/architecture.md) | Proposed system layout and data flow |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Milestones and ordering |
| [`docs/research/design-doc-review.md`](docs/research/design-doc-review.md) | Which claims check out, and what is missing |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Branch, commit, issue and PR workflow |
| [`AGENTS.md`](AGENTS.md) | Instructions for coding agents |

## Primary references

- Kumar et al., *Automating the Search for Artificial Life with Foundation Models* —
  [arXiv:2412.17799](https://arxiv.org/abs/2412.17799)
- Miotti, Niklasson, Randazzo, Mordvintsev, *Differentiable Logic Cellular Automata* —
  [arXiv:2506.04912](https://arxiv.org/abs/2506.04912)
- bbchallenge Collaboration, *Determination of the fifth Busy Beaver value* —
  [arXiv:2509.12337](https://arxiv.org/abs/2509.12337)
- Rupe & Crutchfield, *Local Causal States and Discrete Coherent Structures* —
  [arXiv:1801.00515](https://arxiv.org/abs/1801.00515)
- Faldor & Cully, *CAX: Cellular Automata Accelerated in JAX* —
  [arXiv:2410.02651](https://arxiv.org/abs/2410.02651)
- Balasubramanian, Davydova, Lake, *A local automaton for the 2D toric code* —
  [arXiv:2412.19803](https://arxiv.org/abs/2412.19803), Quantum **10**, 2125 (2026)
- Dünnweber, Styliaris, Trivedi, *Quantum Memory and Autonomous Computation in Two Dimensions* —
  [arXiv:2601.20818](https://arxiv.org/abs/2601.20818)

## License

Not yet chosen — see the license issue in the tracker. Until a licence is added, all rights are
reserved.
