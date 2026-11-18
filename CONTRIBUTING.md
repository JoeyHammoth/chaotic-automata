# Contributing

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
