# Contributing

## Ways to contribute

- Pick up a [`good first issue`](https://github.com/JoeyHammoth/chaotic-automata/issues?q=is%3Aopen+label%3A%22good+first+issue%22)
  or [`help wanted`](https://github.com/JoeyHammoth/chaotic-automata/issues?q=is%3Aopen+label%3A%22help+wanted%22)
  issue. Each one states the expected outcome, where the code lives, and how to check the result.
- Report a bug through the issue form, with the page URL or the failing command.
- Fix a doc, a comment or an error message that cost you time. If it cost you time, it will cost
  someone else time.
- Check a cited constant against its primary source (`kind:research` issues). A number without a
  source is a placeholder, and finding that out is a real contribution.

There is no CLA: contributions are MIT, like the project. [`SUPPORT.md`](SUPPORT.md) says where a
question, a bug and a vulnerability each belong.

## Workflow

1. **Every change starts from an issue.** If the work is not tracked, open one first: what to build,
   acceptance criteria, and what blocks it.
2. **Branch from `main`**, named `<type>/<issue-number>-<slug>` — for example
   `feat/42-atlas-sample-sweep` or `docs/7-design-review`. Types: `feat`, `fix`, `docs`, `test`,
   `chore`, `spike`.
3. **Commit in small, reviewable steps.** Subjects in the imperative mood, ≤ 72 characters, with the
   issue number when the subject alone is not self-explanatory (`Add metric golden file (#42)`).
4. **Open a PR into `main`** and fill in the template: summary, evidence, merge danger. The PR body
   must restate the issue's acceptance criteria and show them being met.
5. **Squash when the commits are noise; keep them when they tell the story.** Either way, `main`
   stays green.

## Definition of done

- [ ] Acceptance criteria from the issue are met, in the PR body, ticked
- [ ] CI green (lint + tests)
- [ ] New behaviour is covered by a test that fails without the change
- [ ] Any new constant, seed or metric is documented where a reader will look
- [ ] Reproduce information (rule, seed, version) is emitted by anything that produces a figure
- [ ] `docs/` updated when behaviour or scope changes

## Run the checks

CI runs each toolchain in its own job. Run the one your change touches — or all of them, for a change
that crosses the seams.

```bash
# Python pipeline
pip install -e ".[dev]"
ruff check .
pytest -q
python scripts/check_doc_links.py   # relative links in the tracked Markdown

# One file, or one test, while iterating
pytest tests/test_inspector.py -q
pytest tests/test_inspector.py -q -k "carrying_the_tiling_frame"

# Rust engines
cargo test --workspace

# Site
cd site
npm ci
npm run typecheck && npm test
npm run build
```

The differential and sweep tests need a release build of their binary; the commands are at the end of
this file, and they are the only checks with a prerequisite beyond the toolchains above.

### In a Codespace

`.devcontainer/devcontainer.json` installs Python 3.12, Node 22 and a stable Rust toolchain with the
`wasm32-unknown-unknown` target, adds a Chromium for Playwright, and runs `pip install -e ".[dev]"`
and `npm ci` in `site/` when the container is created. Open the repository in a
[Codespace](https://codespaces.new/JoeyHammoth/chaotic-automata) — or in a local dev container — and
the commands above work as written. The default 2-core machine is enough: the first
`cargo test --workspace` is slow rather than memory-hungry.

What it does not include, so the container cannot pretend otherwise: Golly, and the release builds of
`ca-diff` and `ca-sweep` that the differential and sweep tests need. Build those as
[Differential harness](#differential-harness) describes, in the container or outside it.

## Code of conduct and security

Participation is covered by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md); reports go through a private
route, never a public issue. A suspected vulnerability follows [`SECURITY.md`](SECURITY.md) — GitHub's
private advisory reporting — and is not filed as a bug. A **wrong result** is neither of those: it is
an issue with the claim, the primary source and the correction (below).

## Labels and triage

Triage roles, module labels and priorities are defined in `docs/agents/triage-labels.md`. Apply one
triage label and at least one `area:` label to every issue. An issue without `ready-for-agent` is not
queued for autonomous work.

## Engineering rules that are not style preferences

- **Determinism.** Same seed, same bytes. If a metric cannot be made deterministic, it records its
  random source explicitly.
- **Undecided stays undecided.** Heuristics may not be presented as proofs; a certificate that fails
  its checker is a failed decider, not a verdict.
- **Independent checking.** A decider and its checker share no code path. An engine and its reference
  share no code at all.
- **No licence contamination.** No GPL/LGPL engine code in this repository. Oracles stay outside.

## Reporting a scientific error

If a published result or constant is misstated anywhere in the docs or app, open an issue with the
claim, the primary source, and the correction. Primary sources only: papers, official docs, or the
authors' own data. A secondary write-up is a lead, not evidence.

## Differential harness

Every engine is checked against an independent reference (ADR 0002). The Python reference stepper lives
in `src/computation_atlas/reference.py`, the comparison harness in
`src/computation_atlas/differential.py`, and the tests are marked `differential`.

```bash
cargo build -p ca-diff --release          # the engine side of the comparison
pytest -m "not differential"              # Python-only suite, fast, no Rust needed
CA_DIFF_BIN=target/release/ca-diff pytest -m differential

# A larger local workload than CI runs:
CA_DIFF_BIN=target/release/ca-diff CA_DIFF_LATTICE=128 CA_DIFF_STEPS=40 pytest -m differential
```

The harness compares whole grids byte for byte and reports the first divergent cell, covers `B0` and
all-survive rules as well as Life, and asserts that a deliberately mutated engine fails it. CI runs the
fast profile in its own job so a Python-only change never waits on a Rust build.

## What to expect

This is a single-maintainer project. Issues and pull requests are answered on a best-effort basis,
with no service-level promise; if a thread has gone quiet, a polite ping is welcome. Every triaged
issue carries one `area:` label, one `kind:` label and one `priority:` label, so you can see where it
sits before you start. A pull request that states its acceptance criteria and shows the evidence for
each gets reviewed fastest.
