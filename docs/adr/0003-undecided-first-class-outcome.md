# 3. Undecided is a first-class outcome

Date: 2026-11-18
Status: Accepted

## Context

Two modules sit on top of questions that are genuinely open. Cycle detection on a finite torus stops
at a budget; a Turing machine may resist every available decider; a face of the fifth Busy Beaver
problem reduces to a Collatz-like conjecture that nobody can settle.

A demo under pressure reports the nearest available label: a capped simulation becomes "chaotic", a
machine without a verdict becomes "non-halting". Both are false statements about the system, and both
are easy to make accidentally, because every UI wants a colour for every pixel.

## Decision

`undecided` (and, for machines, `heuristically non-halting`) are outcomes in their own right, with
their own rendering:

- Cycle detection that hits the cap records `undecided`, and the cap value is displayed.
- A machine without a certificate is never coloured as non-halting. Heuristic verdicts are labelled
  as heuristics and remain visibly distinct from certified ones.
- The atlas renders undecided mass as a hatched texture, and the score is reported with every
  classification.
- Naming an open problem as open is a feature of the Inspector: rule 30 is labelled "no known domain
  decomposition", not given a plausible-looking one.

## Consequences

- Classification totals always include the undecided fraction; percentages of decided cases alone
  are not published.
- Uncertainty is part of the data product, not a footnote: bootstrap intervals accompany every
  metric, and the sample size travels with the number.
- Some pixels have no colour, which is correct and must look deliberate.
- Any agent or contributor adding a classifier is bound by this: an unlabelled guess is a defect.
