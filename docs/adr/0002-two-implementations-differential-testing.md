# 2. Two implementations, differential testing, no borrowed engines

Date: 2026-11-18
Status: Accepted

## Context

The project's credibility rests on reproducing published results and on the claim that optimised
engines are correct. Optimised engines are exactly where correctness is hardest to see: bit-slicing,
quadtree memoisation and GPU parallelism each hide whole classes of bug behind a fast result.

The obvious shortcut — vendor an existing engine such as Golly (GPL-2.0-or-later) or a Rust HashLife
crate — would contaminate the licence and remove the demonstration that the algorithm was understood.

## Decision

Every optimised engine is paired with an independent implementation and checked differentially:

| Engine | Reference | Comparison |
|---|---|---|
| Rust→WASM bit-sliced stepper | Python/NumPy reference | bit-exact on fixed seeds and standard patterns |
| HashLife quadtree | naive stepper | bit-exact over N generations |
| WebGPU compute | CPU tier | bit-exact for deterministic rules |

Published results enter as golden files (rule 90 against Pascal's triangle mod 2, BB(2..4) by
exhaustive search, the BB(5) champion's 47,176,870 steps). External engines are used only as
black-box oracles, at arm's length: their outputs are captured as fixtures, never linked, vendored or
translated.

## Consequences

- Every engine costs roughly two implementations. That cost is the point: it is what makes the
  optimisation claim testable.
- The Python reference is the pipeline's slow path and the definition of the data products; if the
  reference and the engine disagree, the sweep stops.
- Golden files are checked in, small and versioned; regenerating them requires a deliberate commit.
- Oracles that cannot be run in CI are documented as manually verified, with the version recorded.
