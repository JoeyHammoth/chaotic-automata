# 1. Static, serverless, client-side compute

Date: 2026-11-18
Status: Accepted

## Context

The project must be a portfolio artefact that anyone can open, with no operating cost and no data
collection. Its content is expensive to compute (a 262,144-rule sweep, Life patterns run for
astronomical generation counts), but its *interaction* is cheap: a rule runs in milliseconds, and
precomputed data products can be shipped as static files.

Alternatives considered: a server running simulations on demand (simple client, ongoing cost and
availability risk); precomputing every possible view (no live exploration); a native desktop tool (no
shareable link).

## Decision

The app is a static site deployed to GitHub Pages. All interaction is client-side: WebAssembly
engines for discrete rules, WebGPU compute where available, and a CPU fallback ladder. Only the
offline pipeline runs on a machine that is not the visitor's.

Data products are static files (binary arrays, tile pyramids) generated offline and versioned with
the code that produced them.

## Consequences

- Hosting is free and permanent; no accounts, backend, analytics or user data.
- First load must carry the engine, so the performance budget is a hard constraint, not a goal.
- Anything requiring a large model or long training is precomputed; the browser does inference and
  analysis only.
- Capability varies by browser, so results must not vary: every tier must produce identical output
  for deterministic rules, with capability affecting only speed.
- Regenerating data products is a release step, not a runtime concern.
