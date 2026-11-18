# Domain docs

This repo is **single-context**: one glossary, one set of decision records.

```text
/
├── GLOSSARY.md          # domain vocabulary; no implementation detail
├── docs/
│   ├── adr/             # architecture decision records, numbered, one decision each
│   ├── methods.md       # algorithms and verified constants
│   └── limitations.md   # what the project does not claim
```

## Rules for reading

- Before naming anything in code, issues or docs, read `GLOSSARY.md`. Use its words exactly; if a new
  term is needed, add it there in the same change.
- Before changing a module's seam or data product, read the ADRs that touch it. An ADR that
  contradicts the plan is a reason to write a new ADR, not to ignore it.
- Before hard-coding a published constant, check `docs/methods.md`: values there carry their source.
  A constant without a source is a placeholder and must be labelled as one.
- When a claim in `docs/methods.md` is found wrong, fix the doc first, then the code.

## Rules for writing

- `GLOSSARY.md` holds meaning only. Decisions, algorithms and measurements belong in ADRs, methods,
  or the design doc.
- An ADR is offered only when a decision is hard to reverse, surprising without context, and the
  result of a real trade-off. Otherwise record the choice in the PR body.
