# Design document review

Review of `source/Computation_Atlas_v2_Design_Doc.md` (draft 1, 18 Nov 2026), done 18 Nov 2026.

Method: every externally checkable claim was traced to the source that owns it — arXiv abstracts,
publisher pages, the bbchallenge wiki, and the authors' own project pages. Secondary write-ups were
used only as leads. Numbers were read from the primary page, not from a summary.

## Citation check

| Claim in the design doc | Primary source | Verdict |
|---|---|---|
| ASAL, arXiv:2412.17799, illuminates Life-like CA and Lenia | Kumar et al., arXiv:2412.17799 (v2 May 2025); Artificial Life 31(3):368 (2025) | **Correct.** Text target, open-endedness and illumination searches; substrates include Boids, Particle Life, Game of Life, Lenia, NCA |
| DiffLogic CA, arXiv:2506.04912, hardens gates; learns Life, checkerboard, lizard, multi-colour | Miotti et al., arXiv:2506.04912; ISAL 2025, doi:10.1162/ISAL.a.882 | **Correct.** Same four milestones; "distribution over the 16 two-input Boolean functions" matches the paper |
| CAX, arXiv:2410.02651, JAX speed-ups | Faldor & Cully, arXiv:2410.02651; ICLR 2025 oral; MIT licence | **Correct.** Reported speed-ups up to 2,000× (Game of Life), 1,400× (ECA) |
| Local causal states, arXiv:1801.00515; local complexity filtering | Rupe & Crutchfield, Chaos 28, 075312 (2018) | **Correct.** Also confirms the domain/particle correspondence with the dynamically-invariant-set approach |
| BB(5) = 47,176,870; 181,385,789 machines; first formally verified value; arXiv:2509.12337 | bbchallenge Collaboration, arXiv:2509.12337 (v1 Sep 2025, v2 Mar 2026); STOC 2026 | **Correct**, with a date nuance: the proof was announced July 2024, the paper is Sept 2025. Rocq is the current name of Coq |
| Toric-code local automaton from Tsirelson/Gács ideas, arXiv:2412.19803 | Balasubramanian, Davydova, Lake; Quantum 10, 2125 (2026) | **Correct.** Paper is now published, not merely a preprint |
| 2026 self-correcting universal quantum CA in 2D, arXiv:2601.20818 | Dünnweber, Styliaris, Trivedi, arXiv:2601.20818 (v3 Sep 2026) | **Correct.** Dissipative QCA, threshold proved; v3 is still a preprint, so cite it as such |
| Domany–Kinzel density decay exponent "about 0.16" for 1+1D | Standard DP values: `δ = 0.159464(6)`, `β = 0.276486(8)`, `ν∥ = 1.733847(6)` | **Correct.** Use the precise value with its error bar as the validation target |
| Rule 18 domain `(0Σ)*` | Hanson & Crutchfield, as summarised in Mitchell's review and Cenek's dissertation | **Correct.** Also reported: particles perform a random walk |
| Golly and some Rust HashLife crates are GPL | Golly homepage and packaging metadata: GPL-2.0-or-later | **Correct.** Golly is GPLv2+, so the black-box-oracle rule is necessary |
| Toom's rule = majority of self, north, east (NEC) | Toom (1974), per Gács's exposition and Toom's review (arXiv:2306.13226) | **Correct.** Note it was first studied numerically in 1969; Toom supplied the proof |
| Life-like rule space is 2^9 × 2^9 = 262,144 | Arithmetic | **Correct** |

Checked and consistent: the life-like tiling of a 512×512 chart, the 512-neighbourhood exhaustive test
for a learned `B3/S23` circuit, and the `S(2..4) = 6, 21, 107` validation values.

## Corrections to make in the document

1. Cite the BB(5) paper as 2025 (arXiv v1 Sept 2025), not "2024"; keep 2024 as the proof date.
2. Say "Rocq (formerly Coq)" once, then use one name consistently.
3. Replace "about 0.16" with `0.159464(6)` and state the finite-size tolerance.
4. Cite the toric-code paper as published (Quantum 10, 2125) rather than as a preprint.
5. Call arXiv:2601.20818 a preprint; its threshold result is proved but not yet peer-reviewed here.

## Unverified claims (flagged, not disproved)

- **Antihydra machine string.** Quoted in §3.6 with no source; must be checked against the bbchallenge
  wiki before use.
- **Rule 110 ether periods.** The document itself says to verify against Cook (2004) before
  hard-coding. Still unverified.
- **OTCA metapixel dimensions (2058×2058).** Widely reported; confirm on LifeWiki at import time.
- **"No known domain decomposition" for Rule 30.** Stated as a recent-literature claim without a
  citation. Needs a source or softer wording.
- **Lenia growth-function constants.** The formula is standard; the specific `(μ, σ)` chart window and
  `dt` are unstated.

## Structural gap (closed in draft 2)

The review was written against draft 1, whose reading guide promised sections 4-7 (architecture, data,
frontend) and 8-12 (validation, deployment, schedule, risks) plus appendices, but which ended at 3.8.
Draft 2 closes the gap: sections 4-12 and appendices A-D now exist (316 lines became 1463), the header
status says so, and the internal anchors the earlier text relied on (4.5 runtime tiers, 7.4 guided tour,
Section 11 cut lines) now resolve.

Two things did **not** change. The placeholders listed above are still placeholders; draft 2 marks each
one open and names the milestone that closes it, which is the correct outcome of a verification pass that
could not source them. And the build-order consequences stand: the engine stack, data-product format,
site framework and deployment mechanics are decided by the ADRs and by the M0 spike, not by the document.

## Risks worth pinning early

- **Sweep cost is the schedule risk.** 262,144 rules × several metrics × seeds is the long pole; the
  engine spike exists to size it before any sweep code is written.
- **The embedding job needs a GPU** or a documented subsample. The design doc says "hours on a modest
  GPU"; that assumption should be tested on the machine that will run it.
- **Page weight.** Metrics plus embeddings plus tiles can exceed the LCP budget in §1.3. Decide the
  shipping subset before the frontend is built.
- **Two implementations is a real cost** and the reason the schedule must allow for it (ADR 0002).
