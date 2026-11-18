# Glossary

The project's domain language. No implementation detail: this file says what words mean, not how
anything is built.

**Rule space.** The set of all update rules in a rule family, viewed as a space that can be laid out,
traversed and coloured.

**Atlas.** A rendering of rule space as a navigable chart, where position identifies a rule and colour
encodes a behaviour.

**Rule family.** A set of rules sharing a parameterisation — for example all Life-like totalistic
rules, or all single-channel Lenia-style continuous rules at fixed kernel radius.

**Life-like rule.** A two-state, Moore-neighbourhood totalistic rule specified by a birth set `B` and
a survival set `S`, written `B3/S23`. The family contains 262,144 rules.

**Gray-coded axis.** An axis ordering in which adjacent positions differ by exactly one element of a
mask, so neighbouring pixels are minimal edits of each other.

**Coastline.** A boundary in the atlas between regions of qualitatively different behaviour. Its
intricacy at every scale is the atlas's main visual claim.

**Behaviour class.** A coarse label for what a rule does from an ensemble of initial conditions —
frozen, periodic, chaotic, computing, or **undecided**.

**Undecided.** The outcome when a rule's behaviour exceeded the measurement budget. It is a result,
not a failure, and never a synonym for chaotic or non-halting.

**Transient.** The pre-periodic part of a rule's evolution on a finite torus.

**Period.** The cycle length a finite rule settles into, if it settles within budget.

**Damage spreading.** Twin-replica measurement: identical evolution except for one altered cell; the
growth rate of their difference estimates sensitivity to perturbation.

**Domain.** A space-time region whose spatial configurations form a regular language invariant under
the rule — a background pattern such as "every other site is zero".

**Particle.** A localised, temporally periodic structure living on the boundary between domains.

**Collision.** An interaction in which two particles meet and produce a different particle or none —
the elementary event of computation in a rule.

**Causal state.** An equivalence class of histories that induce the same distribution over futures.

**Local causal state.** A causal state inferred from a cell's finite past light cone, used to locate
structure without knowing the rule's domains in advance.

**Local statistical complexity.** How surprising a cell's causal state is — low inside domains, high
at particles.

**Quadtree.** A tree whose node covers a square region and has four children; the storage shape behind
exponential-speed Life simulation.

**Metapixel.** A large pattern that emulates a single cell of another automaton, allowing an
automaton to run inside itself.

**HashLife.** The memoised-quadtree algorithm that caches each distinct subpattern's future, so
repetitive patterns advance astronomically far per step.

**Stress Lab.** The instrument that adds noise and asks where reliable computation survives.

**Toom's rule.** Majority of a cell and its north and east neighbours; noise-robust memory in two
dimensions. Also called the NEC rule.

**Directed percolation (DP).** The universality class of a spreading process with an absorbing state;
the Domany–Kinzel automaton is its standard test bed.

**Decider.** An untrusted program that classifies a machine's behaviour and emits a certificate.

**Certificate.** A small, checkable witness of a decider's verdict — cycle start and period,
translation vector, or bouncer parameters.

**Checker.** The minimal trusted program that validates a certificate by independent replay.

**Cryptid.** A machine whose behaviour resists all available deciders; for the fifth Busy Beaver
value the remaining cryptids reduce to open mathematical problems.

**Signature module.** The one chosen centrepiece beyond the core: Forge (learned rules) or Verifier
(certificates and unknown).

**Metric disagreement.** Pixels where complexity metrics classify a rule differently — a first-class
layer, because "chaos" is definition-dependent.

**Reproduce link.** A URL that restores a figure exactly from rule, seed and version.

**Tier.** A capability level of the runtime (CPU, WASM, WebGPU) that the app falls back through
without changing results.
