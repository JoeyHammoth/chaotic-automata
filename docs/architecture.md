# Architecture

**Status: sketch.** The design document's architecture sections (4–7) are written; this file is the
short working summary, subordinate to that document and to the ADRs in `docs/adr/`. Anything here that is still undecided is listed at the bottom rather than assumed.

## Shape

```text
                  offline, on a workstation / CI            static, in the browser
┌────────────────────────────────────────────┐   ┌────────────────────────────────────┐
│ pipeline/ (Python)                         │   │ site/ (TypeScript)                 │
│  rules, metrics, sweeps, bootstrap CIs     │   │  atlas · inspector · hashlife ·    │
│  embedding job (GPU, optional)             │   │  stress lab · tour · export        │
│  emits data products + golden files        │   │  tiers: WebGPU → WASM → CPU        │
└───────────────────┬────────────────────────┘   └───────────────┬────────────────────┘
                    │  data products (binary, versioned)          │
                    └──────────────► data/ ◄─────────────────────┘
                                     ▲
                     engines: crates/ (Rust → WASM), shared by site and pipeline
```

Three layers, one truth:

1. **Engines.** Discrete simulation lives in Rust crates compiled to `wasm32`, with a pure-CPU
   TypeScript fallback for environments without WASM. Continuous rules (Lenia-lite) run on WebGPU with
   a CPU fallback. Every engine has an independent reference (ADR 0002).
2. **Pipeline.** Python owns the offline sweep, the metrics, the uncertainty estimates and the
   embedding job. It writes immutable data products and the golden files that pin them.
3. **Site.** TypeScript owns interaction, rendering and export. It never computes a published
   classification at runtime; it reads the products and simulates only for live views.

## Data flow

```text
rule space ──► pipeline sweep ──► metrics.bin (fp16, 512×512×metrics)
                    │            classes.bin (labels + agreement score)
                    │            embed2d.bin, embed_vec.bin
                    └─► tile pyramid (pre-rendered colourings)
                                        │
                         site loads tiles + products, renders atlas
                                        │
                    click ──► engine runs the rule live (ms), shareable URL
```

The URL is the state: rule, seed, metric, zoom and selected instrument all live in the query string,
so any view can be linked and reproduced. That is the export story: a figure is a URL plus a version
hash, not a screenshot.

## Data products

| Artefact | Contents | Approx. size |
|---|---|---|
| `lifelike_metrics.bin` | 512×512×~16 metrics, fp16 | ~8 MB |
| `lifelike_classes.bin` | per-pixel class labels + agreement score | <1 MB |
| `lifelike_embed2d.bin` | 2D UMAP coordinates, fp16 | ~1 MB |
| `lifelike_embed_vec.bin` | compact embedding vectors | 8–33 MB |
| `tiles/{z}/{x}/{y}.webp` | pre-rendered colouring pyramid | tens of MB |

Thumbnails of rollouts are not shipped; they are simulated on demand.

## Runtime tiers

| Tier | Provides | Fallback behaviour |
|---|---|---|
| WebGPU | Lenia-lite, large-grid stepping, metric overlays | falls back to WASM |
| WASM | all discrete rules, HashLife, deciders | falls back to TS/CPU |
| CPU | correctness floor, reduced rates | still exact, slower |

A tier may change performance only. Deterministic rules must produce identical output on every tier;
this is what the differential tests assert.

## Deployment

GitHub Pages, built and published by CI from `main`. No server, no runtime secrets, no analytics
(ADR 0001). Preview builds for PRs if the Pages setup permits it; otherwise a CI check that builds
the site and runs the smoke tests.

## Module boundaries

Each instrument is a module with a small interface and a large implementation:

- `atlas`: given screen coordinates and zoom, resolve to a rule; given a rule, return its metrics.
- `inspector`: given a 1D rule and a seed, return domains, particles and their interactions.
- `hashlife`: given a pattern and a generation count, return the pattern at that generation.
- `stress lab`: given a rule and a noise rate, return survival statistics with error bars.
- `verifier`: given a machine, return an outcome class plus an optional certificate.

The instruments do not read each other's internals; they compose through rule identity and the URL.

## Open questions

These are issues, not assumptions:

- ~~Which engine stack wins on measured startup and stepping cost~~ — decided: Rust→WASM
  bit-packed, with a TypeScript `u8` reference floor (ADR 0004).
- Whether the atlas ships a single colouring per load or streams additional metric layers.
- How embeddings are shipped without exceeding the page-weight budget (quantisation vs subsample).
- Whether PR previews are possible on Pages under the current repository settings.
- Site framework choice: hand-rolled TypeScript + Vite, or a framework. Not yet decided; the atlas is
  canvas-first, so the framework buys little.
