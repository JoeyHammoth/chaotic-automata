# ADR 0004: Run the engines as Rust compiled to WASM, stepping bit-packed grids

| | |
|---|---|
| **Status** | Accepted (18 November 2026) |
| **Deciders** | Project owner, from the measurements in issue #2 |
| **Confirms** | [ADR 0002](0002-two-implementations-differential-testing.md) — the two-implementation pairing stands; this ADR fixes which implementation is which |
| **Supersedes** | Nothing |

## Context

The design document's architecture sections were unwritten, so the engine stack was an open decision
gating the sweep, the site and the WebGPU tier. ADR 0002 already required two independent
implementations and forbade borrowing GPL engine code, but did not say what the fast path would be,
what the reference would be, or whether the sweep needed a GPU at all.

Three questions had to be answered with numbers rather than taste:

1. Is a Rust→WASM engine fast enough, and does it start quickly enough, to be the site's fast path?
2. Does a bit-packed representation buy enough over a plain `u8` grid to justify its complexity?
3. Does the 262,144-rule sweep need a GPU, or does a CPU engine fit the budget?

## Decision

**The fast path is Rust, compiled to `wasm32-unknown-unknown`, stepping bit-packed grids (one bit per
cell, 64 cells per word, four carry-save planes for neighbour counts). The reference path is a plain
`u8` per-cell implementation, written twice — once in Rust (the differential oracle for the packed
path) and once in TypeScript (the Tier-0 browser fallback). No GPU path is built for the sweep.**

Specifically:

- **T2/T1 engine**: `ca-core` in Rust, bit-packed, exported through a raw `wasm32` ABI (~30 KB module).
- **Reference**: the naive `u8` stepper, in Rust for offline comparison and in TypeScript for the
  browser floor. Same algorithm in both, which is what makes the comparison meaningful.
- **T0**: the TypeScript `u8` stepper. It is the correctness floor, not a performance claim.
- **WebGPU**: reserved for continuous rules (Lenia-lite) and large-grid display only. It is not part of
  the sweep.
- **Sweep default lattice: 64×64.** The projection below makes 512×512 a per-figure choice, not a
  default.

## What was measured

Machine: 12th Gen Intel Core i7-12650H (16 logical cores, Intel gen-12lp iGPU), 16 GB RAM,
Windows 10.0.26200. Node 24.20.0 (V8), rustc 1.100.0, Chrome 157.0.8103.79. Workload: 512×512 torus,
Life-like B3/S23, random soup at 30% density from a fixed xorshift32 seed, single-threaded,
median of 5 trials after warm-up. Units are per generation of the whole grid.

| Implementation | ms/step | steps/s | ns/cell | vs JS `u8` |
|---|---:|---:|---:|---:|
| TypeScript/JS `u8` | 2.767 | 361 | 10.56 | 1.0× |
| WASM `u8` | 1.909 | 524 | 7.28 | 1.4× |
| **WASM bit-packed** | **0.092** | **10,912** | **0.35** | **30.2×** |
| Native `u8` | 1.796 | 557 | 6.85 | 1.5× |
| Native bit-packed | 0.131 | 7,634 | 0.50 | 21.1× |
| WebGPU `u8`, 1 rule/dispatch | 0.541–0.772 | 1,296–1,847 | 2.06–2.94 | ~5× |
| WebGPU `u8`, 32 rules/dispatch (per rule) | 0.377–0.427 | — | 1.63 | ~6.5× |

Startup and footprint for the WASM module:

| Property | Measured |
|---|---|
| Module size | 30,703 bytes (30 KB) |
| Compile + instantiate (V8) | 0.307 ms median |
| First `step` after instantiate (a click) | 0.088 ms |
| Grid init (262,144 cells) | 1.9 ms |
| Linear memory after init | 2.31 MB |

Correctness check, not an assumption: all five paths (JS `u8`, WASM `u8`, WASM packed, native `u8`,
native packed) produce the same 25-step grid digest from the same seed (`4129497080`), and a one-step
comparison of packed versus `u8` reports **0 differing cells**. Two bugs were found and fixed this way
during the spike — a plane offset that added every row into the first eight words, and an equality test
that matched count 7 instead of count 3. Both would have produced a plausible-looking, wrong map.

## Sweep projection

262,144 rules × 200 steps × 5 seeds = 2.62 × 10⁸ rule-steps. Cost is extrapolated linearly in cell
count from the measured 512×512 rate — that linearity is the load-bearing assumption, and it holds for
a kernel that touches every cell once per step.

| Lattice | JS `u8` | WASM `u8` | WASM packed | Native packed |
|---|---:|---:|---:|---:|
| 64×64 | 3.2 h | 2.2 h | **6 min** | 9 min |
| 128×128 | 12.6 h | 8.7 h | **25 min** | 35 min |
| 256×256 | 50 h | 35 h | **1.7 h** | 2.3 h |
| 512×512 | 201 h | 139 h | **6.7 h** | 9.6 h |

Stated as a range with visible assumptions: **the Family-A sweep is 6 minutes to 1.7 hours at 64²–256²
on one core of WASM, and 6.7–9.6 hours at 512²**; native parallelises across 16 cores for roughly a
10–14× wall-clock reduction, since the workload is embarrassingly parallel. No GPU is involved in
either number.

## Why the GPU is not part of the sweep

The batched measurement is the decisive one: with 1, 8 and 32 rules per dispatch, the cost per
rule-step stayed at 0.54, 0.51 and 0.43 ms. It barely moved with batch size, which means the kernel is
**dispatch- and overhead-bound**, not arithmetic- or bandwidth-bound — as expected for a nine-read,
one-write stencil on 512² cells. At 1.6–2.9 ns per cell the iGPU is 5–8× slower than the packed CPU
path (0.35 ns/cell), not faster.

A discrete GPU would change the *magnitude* at 512² and nothing else: the CPU path already lands at
6.7 hours, the sweep is not on the critical path for M1 (the atlas needs the data once, not nightly),
and a GPU tier would add a second engine to keep bit-exact with the CPU under ADR 0002. The tier
ladder keeps WebGPU where it does earn its keep — Lenia-lite and large-grid display — and this ADR
removes the justification for using it in the pipeline.

## Recommendation on writing the optimised engine

**Write the packed engine now, as the only engine, and keep the `u8` stepper as the test oracle.**
The ordering "reference first, optimise later" would cost a rewrite of the sweep, because the sweep's
data layout and the site's click path both sit on the packed representation. The reference is cheap
(~40 lines in each language) and stays valuable forever as the differential oracle.

## Consequences

- The atlas click path costs ~0.09 ms per generation at 512², so live simulation of a rule under the
  cursor is comfortably inside the 50 ms budget with room for rendering.
- The site's first load carries a 30 KB engine binary, well under the 1.5 MB budget in the design
  document (§8.1).
- The sweep fits on a laptop: no cloud GPU, no notebook with a 10-hour cell, no subsample excuse for
  the Family-A map.
- Two representations must stay in agreement, forever. That is a test-suite obligation (one-step
  fixture plus 25-step digests per rule family), and it is the cost this ADR knowingly accepts.
- `u8` in Rust is *slower* than packed but not slower than `u8` in JS, so the TypeScript floor is
  ~30× behind the fast path. The tier ladder must therefore be honest about speed, and the design
  document's "tiers change speed only" rule applies.

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **TypeScript-only engine** | 361 steps/s at 512² makes the sweep 201 h and the live view sluggish; the packed path is 30× faster for one crate and one ABI. |
| **Rust `u8` engine (native and WASM)** | 1.4–1.5× over JS is not worth a second language on its own; the packed representation is what pays for Rust. |
| **WebGPU as the sweep engine** | Measured 5–8× *slower* per cell than packed CPU at the sizes that matter, and it adds a bit-exactness obligation across a third implementation. |
| **wasm-bindgen + JS glue** | Not needed for a numeric kernel; raw exports keep the module at 30 KB and remove a build dependency. Revisit if the engine API grows rich types. |
| **Ship the reference and optimise later** | The sweep and the site would both be written against the wrong layout, so the "later" is a rewrite, not an optimisation. |

## What this ADR does not decide

- The site framework, the tile format, the embedding runtime, and the licence remain open (Section 12.3
  of the design document).
- Whether a discrete GPU (as opposed to this machine's iGPU) beats the CPU path at 512². The
  measurement here is an integrated GPU; a discrete card could invert the ratio. It would still not
  change the decision, because the CPU path is already inside budget.
- Any rule family other than Life-like totalistic CA. Lenia-lite is a different kernel and belongs to
  the WebGPU tier by design.

## Revisit triggers

Reopen this decision if any of the following happens:

1. Sweep wall-clock exceeds 24 h at the chosen lattice on the reference machine.
2. A discrete GPU measures more than 10× the packed CPU path *per rule-step* on the real sweep kernel.
3. The packed path's bit-exactness with the `u8` reference fails and cannot be repaired within a
   milestone.
4. WASM binary size exceeds 300 KB after the real engine (HashLife, deciders) lands, making the
   30 KB figure unrepresentative.

## Reproduction

The probe is a throwaway: two Rust functions (`u8` and packed), a Cargo manifest with
`crate-type = ["cdylib", "rlib"]`, a Node harness that instantiates the `.wasm` and times it, and a
Puppeteer page with a WGSL compute shader for the GPU comparison. It is deliberately not committed
(issue #2 acceptance: probe parked, nothing half-finished on `main`); the method above is enough to
rebuild it in an hour. Numbers were taken on the machine described, with the versions listed, and the
digests are recorded so a re-run can be checked against them.
