# Roadmap

The spine is **M1 + M2 + M3 + M4 + one signature module**. Everything else is a cut line. Milestones
are delivery boundaries; the project board is the live queue.

| Milestone | Modules | Exit criterion |
|---|---|---|
| **M0 · Foundations** | platform | Engine stack chosen by measurement; two implementations agree bit-exactly; CI builds and publishes; docs pages live |
| **M1 · Atlas** | M1 | 512×512 Life-like map loads in < 2.5 s LCP and pans inside 16.7 ms/frame (measured 0.95 s and 7.2 ms on the deployed build, `docs/performance.md`); disagreement layer shipped; Conway Life and the named landmark rules measure inside their expected metric ranges, and are reported `undecided` where the run cap binds |
| **M2 · Inspector** | M2 | Rule 90 matches Pascal mod 2; rule 18 recovers `(0Σ)*`; rule 110 ether/glider decomposition passes golden periods; shuffled-time nulls yield no spurious particles above the stated false-positive rate |
| **M3 · HashLife Zoom** | M3 | Bit-exact against the naive stepper; Golly-captured golden generations pass; metapixel zoom works; memory gauge and node cap enforced |
| **M4 · Stress Lab** | M4 | Toom lifetime grows with `L` below threshold and collapses above; Domany–Kinzel boundary and `δ ≈ 0.1595` fit within stated tolerance; noise overlay re-colours the atlas |
| **M5 · Signature module** | M5a or M5b | Forge: hardened circuit matches hard forward pass and recovers `B3/S23` on all 512 neighbourhoods. Verifier: BB(2..4) exhaustive values reproduce, BB(5) champion halts at 47,176,870, mutated certificates are rejected |
| **M6 · Compiler** *(stretch, cut line)* | M6 | Decoder output equals the cyclic-tag reference trace for a battery of programs; otherwise ship "Rule 110 anatomy" |
| **M7 · Heritage** *(stretch, cut line)* | M7 | Sandpile statistics reproduced with log-binned MLE and finite-size scaling, with the original biased fit shown beside it |

## Order of work

1. **Platform first.** The engine spike decides representation for everything else. Doing it late
   means rewriting the sweep.
2. **Atlas before instruments.** The atlas is the hero and the fastest path to something demoable; the
   Inspector needs the same engine and the same URL state.
3. **HashLife in parallel with the atlas sweep.** It is independent of the data products and purely
   algorithmic, which makes it safe to interleave.
4. **Stress Lab after the atlas**, because its noise overlay is a re-colouring of an existing map.
5. **Signature module last.** It is the most research-shaped work and the one most likely to slip.

## Cut lines, in order

1. M6 Compiler → phases 1–2 only ("Rule 110 anatomy").
2. M7 Heritage → keep as a short page using the statistics toolkit, no engine migration.
3. Lenia-lite → ship the discrete atlas only.
4. Foundation-model embedding → ship the metric space only, no alternative layout.

## Not scheduled

Flow-Lenia mass conservation, spatially resolved Lyapunov profiles, 2D computational-mechanics
reconstruction, full decider coverage for BB(6), and any server-side component.
