# AGENTS.md

Instructions for coding agents working in this repository.

## What this repo is

Computation Atlas: a static, client-side map of cellular-automaton rule space, plus the offline
pipeline that computes its data products. The design lives in
`source/Computation_Atlas_v2_Design_Doc.md`; the vocabulary is in `GLOSSARY.md`; the architecture
proposal is in `docs/architecture.md`.

Work from the issue tracker. An issue is the unit of work; a PR is the unit of review. Do not invent
scope beyond the issue.

## Commands

```bash
pip install -e ".[dev]"   # offline pipeline + dev tools
pytest -q                 # pipeline tests
ruff check .              # lint
```

The legacy sandpile lab under `source/python/` is heritage code (module M7). Leave its behaviour
alone unless the issue says otherwise; it is scheduled for migration onto the shared engine.

## Conventions

- Determinism: artefact producers take an explicit seed and write it into their output. A metric
  without a seed and version is wrong, not merely untidy.
- Undecided is a valid result. When a budget cap is hit, record `undecided`; never re-label it
  "chaotic", "non-halting" or "dead".
- Two implementations: engine changes require agreement with the independent reference
  (`docs/adr/0002-two-implementations-differential-testing.md`). If you cannot run both, say so.
- No GPL engine code. Golly and similar implementations may be used as black-box oracles in tests
  only; never link or vendor them.
- Verified constants live in `docs/methods.md` with a citation. Change the doc and the code in the
  same PR when a constant changes.

## Agent skills

### Issue tracker

Issues and PRs live in this repo's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles, label strings equal to their names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the root, decisions in `docs/adr/`. See `docs/agents/domain.md`.
