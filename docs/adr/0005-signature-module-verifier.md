# 5. Signature module: Verifier, not Forge

Date: 2026-11-21
Status: Accepted

## Context

The spine takes one centrepiece beyond the core (design §2.3). Two candidates were specified and both
are defensible on their own terms; only one gets built, because the schedule is a portfolio cut and
not a wish list.

| | Forge (M5a) | Verifier (M5b) |
|---|---|---|
| What it demonstrates | differentiable logic gates hardened into a discrete circuit | deciders, checkable certificates and an honest `unknown` |
| Compute | training run, a GPU, a model zoo | none; CPU, seconds per machine |
| Dependencies | a framework, weights to ship, a caching story | nothing beyond the engine |
| Shape of the result | recovers `B3/S23` — a known outcome | classifies machines whose verdicts must be checked |
| Failure mode | training divergence, silent overfitting | scope creep in decider coverage |
| Testability in CI | a trained artefact, hard to pin | a checker that either validates a certificate or rejects it |

## Decision

Build **Verifier** (M5b).

Three reasons, in order of weight:

1. **It fits the project's existing honesty machinery.** ADR 0003 makes `undecided` a first-class
   outcome; a verifier's `unknown` is the same commitment applied to machines, and the two can share
   a rendering vocabulary rather than inventing a second one.
2. **Every claim it makes is checkable in CI.** A certificate is a small witness, and the checker is
   the trusted core. That means the module's science is tested by rejection of mutated certificates,
   which is a test anyone can run, rather than by trusting a training run.
3. **It costs no compute and ships no weights.** Forge would add a training pipeline, a GPU
   dependency and a multi-megabyte artefact to a site that currently serves a static bundle.

Forge is not rejected on merit. It is a strong 2025 result and remains the documented alternative; it
is simply the wrong trade for a project whose credibility rests on reproduction and verification.

## Consequences

- #24 (deciders, independent checker, certificate mutation tests) proceeds. No Forge tickets exist,
  so none need closing; the design's M5a section is the record of what was not built.
- The validation target is restated precisely: BB(2..4) exhaustive values reproduce, the BB(5)
  champion halts at 47,176,870, and mutated certificates are rejected. **The values are taken from the
  bbchallenge formalisation, not from memory**; a constant without a citation is a defect.
- The checker is the trusted core and stays minimal. Deciders are untrusted programs by definition.
- `unknown` must never be rendered as non-halting (ADR 0003), and a heuristic verdict stays visibly
  distinct from a certified one.
- The roadmap's M5 exit criterion names Verifier; the ship checklist drops Forge's clause.
- If the schedule slips, Verifier is still cuttable at the chapter boundary: the site can ship M1–M4
  without a signature module, and this ADR records why that would be a smaller loss than shipping a
  trained model nobody can check.
