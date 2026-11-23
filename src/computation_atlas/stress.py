"""M4 Stress Lab: Toom's rule and the Domany-Kinzel automaton, as a product.

Two questions, one instrument. **Toom**: does a stored bit survive independent noise, and does its
lifetime grow with the lattice? **Domany-Kinzel**: where is the active/absorbing boundary in the
`(p1, p2)` plane, and does the density at the directed-percolation point decay with the DP exponent?

Everything here is bit-parallel. A lattice is one Python integer, one bit per cell, so a step is a
handful of shifts, masks and XORs on a `L^2`-bit integer rather than a Python loop over cells. That
is what makes a pure-Python sweep affordable: the cost per step is independent of the lattice area.

Noise is **exact, not sampled per cell**. A mask whose bits are independently one with probability
`m/2^k` is built by bit-slicing `k` random words and comparing the sliced value against `m`; every
bit is then an independent Bernoulli(`m/2^k`) draw. The consequence is that the noise grid is
dyadic — `1/256, 1/128, 1/64, 1/32, 1/16, 1/8, 1/4` — and each of those is exactly representable,
so a label and the simulation cannot drift. A grid of decimal round numbers would have forced either
per-cell sampling or a rounded probability that the document would have had to lie about.

A run that reaches the step cap is **capped**, and a capped lifetime is a lower bound, never a
number: the document carries the flag and the page draws it as `>= cap`. This is the same rule the
atlas applies to undecided runs.
"""

from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path

PANEL_VERSION = 1

# Dyadic, so each value is exact and a mask costs at most six random words.
NOISE_GRID = (1 / 64, 1 / 32, 1 / 16, 3 / 32, 1 / 8, 1 / 4)
TOOM_LATTICES = (8, 16, 32, 64)
TOOM_SEEDS = (11, 23, 37)
TOOM_CAP = 5000

# Domany-Kinzel. Bond DP is the line p2 = p1(2 - p1) and is critical at p1 = p_c = 0.644700185,
# i.e. (0.644700185, 0.873762040). The decay is measured in the equivalent bond process instead,
# because there p_c enters as one probability rather than through a grid: (p1, p2) would have to be
# rounded to the 1/16 diagram lattice, and rounding p_c by 0.02 moves the run off criticality.
DK_GRID = 16  # p1, p2 on the 1/16 lattice: 17 x 17 points, each an exact Bernoulli
DK_DIAGRAM_LATTICE = 256
DK_DIAGRAM_STEPS = 400
DK_DIAGRAM_SEEDS = (11, 23)
DK_CRITICAL = (0.644700185, 0.873762040)
BOND_PC_NUM = 2641  # 2641/4096 = 0.6447754, within 7.5e-5 of the quoted p_c
BOND_PC_DEN = 4096
DK_DECAY_LATTICES = (512, 1024)
# The decay is a small effect: rho changes by a factor of about 2.5 over four decades, so the
# estimator is variance-limited long before it is time-limited. Many short rings beat a few long
# ones, and the interval is bootstrapped over seeds because that is where the noise lives.
DK_DECAY_SEEDS = (
    11,
    23,
    37,
    53,
    71,
    97,
    131,
    151,
    181,
    211,
    241,
    271,
    307,
    337,
    367,
    397,
    431,
    461,
    491,
    521,
    557,
    587,
    617,
    647,
    677,
    709,
    739,
    769,
    797,
    827,
    857,
    887,
)
DK_DECAY_STEPS = 4000
DK_FIT_WINDOW = (100, 4000)
DELTA_DP = 0.159464
DELTA_DP_SE = 0.000006
# The quoted value carries six decimal places; a fit over 4,000 steps cannot. The band is stated
# rather than implied, and it is set by what this run can resolve, not by the precision of 0.159464.
DELTA_TOLERANCE = 0.05
BOND_PC = 0.644700185  # Jensen (1999), J. Phys. A 32, 5233, low-density series
SITE_PC = 0.70548522
CITED = {
    "toom": {
        "text": (
            "Toom's theorem: below a nonzero noise threshold, NEC majority stores a bit for a time "
            "that diverges with the lattice; symmetric majority does not."
        ),
        "source": "Toom (1974); Gacs, J. Stat. Phys. 103, 307 (2001); Toom, arXiv:2306.13226",
        "verified": False,
    },
    "delta": {
        "text": (
            "Directed-percolation density decay exponent delta = 0.159464(6) in 1+1 dimensions."
        ),
        "source": "Hinrichsen, Adv. Phys. 49, 815 (2000); Jensen, J. Phys. A 32, 5233 (1999)",
        "verified": False,
    },
    "pc": {
        "text": "Directed bond percolation is critical at bond density p_c = 0.644700185(5).",
        "source": "Jensen, J. Phys. A 32, 5233 (1999), arXiv:cond-mat/9906036",
        "verified": False,
    },
}


# --- bit-parallel lattices -------------------------------------------------------------------


def _row_masks(lattice: int) -> tuple[int, int, int]:
    """``full``, column-0 and column-(L-1) masks for a flat row-major lattice."""
    full = (1 << (lattice * lattice)) - 1
    first = sum(1 << (row * lattice) for row in range(lattice))
    last = first << (lattice - 1)
    return full, first, last


def _east(state: int, lattice: int, full: int, last: int) -> int:
    """The east neighbour of every cell, wrapping inside the row rather than into the next row."""
    return ((state >> 1) & (full ^ last)) | ((state << (lattice - 1)) & last)


def _west(state: int, lattice: int, full: int, first: int) -> int:
    """The west neighbour of every cell, wrapping inside the row."""
    return ((state << 1) & (full ^ first)) | ((state >> (lattice - 1)) & first)


def _north(state: int, lattice: int) -> int:
    """Row ``r-1``: row 0 takes row ``L-1``."""
    full = (1 << (lattice * lattice)) - 1
    return ((state << lattice) & full) | (state >> (lattice * (lattice - 1)))


def _south(state: int, lattice: int) -> int:
    """Row ``r+1``: row ``L-1`` takes row 0."""
    return (state >> lattice) | (((1 << lattice) - 1 & state) << (lattice * (lattice - 1)))


def majority3(a: int, b: int, c: int) -> int:
    """Bitwise majority of three bitsets."""
    return (a & b) | (c & (a ^ b))


def bernoulli(rng: random.Random, width: int, numerator: int, denominator: int) -> int:
    """A ``width``-bit mask, each bit independently one with probability ``numerator/denominator``.

    ``denominator`` must be a power of two. ``k = log2(denominator)`` random words are read as the
    k bits of a uniform integer per column and compared with ``numerator`` by bit-sliced subtraction
    of the comparison accumulator: no per-cell Python loop, and the probability is exact.
    """
    if numerator < 0 or numerator > denominator:
        raise ValueError("probability must lie in [0, 1]")
    if denominator & (denominator - 1):
        raise ValueError("denominator must be a power of two")
    if numerator == 0:
        return 0
    if numerator == denominator:
        return (1 << width) - 1
    slices = []
    for _ in range(denominator.bit_length() - 1):
        slices.append(rng.getrandbits(width))
    full = (1 << width) - 1
    equal = full
    less = 0
    for index in range(len(slices) - 1, -1, -1):
        bit = (numerator >> index) & 1
        current = slices[index]
        if bit:
            less |= equal & (full ^ current)
            equal &= current
        else:
            equal &= full ^ current
    return less & full


def toom_step(state: int, lattice: int, rule: str = "nec", *, coin: int = 0) -> int:
    """One update. ``nec`` is majority of self, north and east.

    ``symmetric`` is the plain majority of the four neighbours, with a 2-2 tie resolved by the
    ``coin`` bitset. The tie-break is what removes the ordered phase: a straight interface is all
    ties, so it performs a random walk, and the stored bit is lost once the walk wraps the torus.
    That is the contrast Toom's rule was built against, and it is the rule the literature compares
    with -- not the five-cell majority, which is an Ising model and has a threshold of its own.
    """
    full, first, last = _row_masks(lattice)
    east = _east(state, lattice, full, last)
    north = _north(state, lattice)
    if rule == "nec":
        return majority3(state, north, east)
    if rule == "symmetric":
        south = _south(state, lattice)
        west = _west(state, lattice, full, first)
        at_least_two = (
            (north & south)
            | (north & east)
            | (north & west)
            | (south & east)
            | (south & west)
            | (east & west)
        )
        at_least_three = (
            (north & south & east)
            | (north & south & west)
            | (north & east & west)
            | (south & east & west)
        )
        tie = at_least_two & (full ^ at_least_three)
        return at_least_three | (tie & coin)
    raise ValueError(f"unknown rule {rule!r}")


def toom_lifetime(
    lattice: int,
    noise: float,
    seed: int,
    *,
    rule: str = "nec",
    cap: int = TOOM_CAP,
) -> tuple[int, bool]:
    """Steps until fewer than half the cells hold the initial bit, or ``cap``.

    Returns ``(steps, capped)``. A capped run is a lower bound on the lifetime and is never reported
    as a lifetime.
    """
    denominator = 256
    numerator = round(noise * denominator)
    if abs(noise - numerator / denominator) > 1e-12:
        raise ValueError(f"noise {noise!r} is not on the 1/256 grid")
    rng = random.Random(seed)
    cells = lattice * lattice
    state = (1 << cells) - 1
    for step in range(1, cap + 1):
        coin = bernoulli(rng, cells, 1, 2) if rule == "symmetric" else 0
        state = toom_step(state, lattice, rule, coin=coin)
        state ^= bernoulli(rng, cells, numerator, denominator)
        if state.bit_count() * 2 < cells:
            return step, False
    return cap, True


# --- Domany-Kinzel ---------------------------------------------------------------------------


def dk_step(state: int, lattice: int, p1: float, p2: float, rng: random.Random) -> int:
    """One parallel Domany-Kinzel update on a ring of ``lattice`` cells."""
    full = (1 << lattice) - 1
    left = ((state << 1) | (state >> (lattice - 1))) & full
    right = ((state >> 1) | (state << (lattice - 1))) & full
    exactly_one = left ^ right
    both = left & right
    denominator = DK_GRID
    one_mask = bernoulli(rng, lattice, round(p1 * denominator), denominator)
    two_mask = bernoulli(rng, lattice, round(p2 * denominator), denominator)
    return (exactly_one & one_mask) | (both & two_mask)


def bond_step(
    state: int,
    lattice: int,
    rng: random.Random,
    *,
    numerator: int = BOND_PC_NUM,
    denominator: int = BOND_PC_DEN,
) -> int:
    """One step of directed bond percolation on a ring: each site is wet if a wet parent is
    connected to it by an open bond. This is Domany-Kinzel with ``p1 = p``, ``p2 = 2p - p^2``."""
    full = (1 << lattice) - 1
    west = ((state << 1) | (state >> (lattice - 1))) & full
    east = ((state >> 1) | (state << (lattice - 1))) & full
    left_bond = bernoulli(rng, lattice, numerator, denominator)
    right_bond = bernoulli(rng, lattice, numerator, denominator)
    return (west & left_bond) | (east & right_bond)


def bond_run(
    lattice: int,
    seed: int,
    steps: int,
    *,
    initial: float = 0.5,
    numerator: int = BOND_PC_NUM,
    denominator: int = BOND_PC_DEN,
) -> list[float]:
    """Density per step for directed bond percolation at bond probability ``numerator/denominator``.

    The critical point is hit without the grid rounding that the `(p1, p2)` diagram needs, because
    here it enters as a single probability: 2641/4096 is within 7.5e-5 of the quoted ``p_c``.
    """
    rng = random.Random(seed)
    state = bernoulli(rng, lattice, round(initial * DK_GRID), DK_GRID)
    densities = [state.bit_count() / lattice]
    for _ in range(steps):
        state = bond_step(state, lattice, rng, numerator=numerator, denominator=denominator)
        densities.append(state.bit_count() / lattice)
    return densities


def dk_run(
    lattice: int,
    p1: float,
    p2: float,
    seed: int,
    steps: int,
    *,
    initial: float = 0.5,
) -> list[float]:
    """Density per step from a random row of the given density. Index 0 is the initial row."""
    rng = random.Random(seed)
    state = bernoulli(rng, lattice, round(initial * DK_GRID), DK_GRID)
    densities = [state.bit_count() / lattice]
    for _ in range(steps):
        state = dk_step(state, lattice, p1, p2, rng)
        densities.append(state.bit_count() / lattice)
    return densities


def dk_active(densities: list[float], *, tail: float = 0.1, floor: float = 0.005) -> bool:
    """Active if the mean density over the last ``tail`` of the run is above ``floor``."""
    start = max(0, int(len(densities) * (1 - tail)))
    window = densities[start:]
    return bool(window) and sum(window) / len(window) > floor


def dk_survival(
    lattice: int, p1: float, p2: float, seeds: tuple[int, ...], steps: int
) -> dict[str, object]:
    """Fraction of seeds still active, and the mean final density, at one ``(p1, p2)``."""
    runs = [dk_run(lattice, p1, p2, seed, steps) for seed in seeds]
    active = sum(1 for densities in runs if dk_active(densities))
    final = sum(densities[-1] for densities in runs) / len(runs)
    return {"active": active / len(runs), "density": final, "seeds": list(seeds)}


def fit_exponent(densities: list[float], window: tuple[int, int]) -> float | None:
    """Least-squares slope of ``ln rho`` against ``ln t``: the decay exponent ``delta``.

    ``None`` when any density in the window is zero (the run absorbed, so the window is not in the
    active phase) or when the window holds fewer than three samples. A slope through zeros is not a
    measurement, and a window that reaches the absorbing state is not a decay.
    """
    low, high = window
    samples = [densities[time] for time in range(low, min(high, len(densities) - 1) + 1)]
    if len(samples) < 3 or any(value <= 0 for value in samples):
        return None
    points = [
        (math.log(time), math.log(densities[time])) for time in range(low, low + len(samples))
    ]
    if len(points) < 3:
        return None
    mean_x = sum(x for x, _ in points) / len(points)
    mean_y = sum(y for _, y in points) / len(points)
    numerator = sum((x - mean_x) * (y - mean_y) for x, y in points)
    denominator = sum((x - mean_x) ** 2 for x, _ in points)
    if denominator == 0:
        return None
    return -numerator / denominator


def mean_curve(curves: list[list[float]]) -> list[float]:
    """Density at each time, averaged over runs.

    The slope is fitted to the averaged curve rather than to each run and then averaged: a single
    ring is one correlated sample, so its own slope is nearly meaningless, while the mean density is
    the quantity that decays as a power law.
    """
    count = len(curves)
    return [sum(values) / count for values in zip(*curves, strict=False)]


def _percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(fraction * (len(ordered) - 1))))
    return ordered[index]


def decay_fit(
    lattice: int,
    seeds: tuple[int, ...],
    steps: int,
    window: tuple[int, int],
    *,
    resamples: int = 200,
    rng_seed: int = 5,
) -> dict[str, object]:
    """The averaged decay exponent at the DP point, with a percentile bootstrap over seeds."""
    curves = [bond_run(lattice, seed, steps) for seed in seeds]
    delta = fit_exponent(mean_curve(curves), window)
    absorbed = sum(1 for curve in curves if curve[-1] == 0)
    rng = random.Random(rng_seed)
    boot = []
    for _ in range(resamples):
        pick = [curves[rng.randrange(len(curves))] for _ in seeds]
        value = fit_exponent(mean_curve(pick), window)
        if value is not None:
            boot.append(value)
    return {
        "lattice": lattice,
        "delta": delta,
        "interval": [_percentile(boot, 0.025), _percentile(boot, 0.975)],
        "runs": len(curves),
        "seeds": list(seeds),
        "absorbed": absorbed,
        "window": list(window),
    }


def verdict(fit: dict[str, object]) -> dict[str, object]:
    """Compare a fit with the quoted DP exponent. A miss is a miss."""
    delta = fit.get("delta")
    if delta is None:
        return {"state": "undecided", "text": "the run absorbed before the fit window closed"}
    difference = float(delta) - DELTA_DP
    low, high = fit.get("interval") or (None, None)
    contains = low is not None and high is not None and float(low) <= DELTA_DP <= float(high)
    if abs(difference) <= DELTA_TOLERANCE:
        state = "consistent"
        text = f"within the stated tolerance of +/-{DELTA_TOLERANCE:g}"
    else:
        state = "miss"
        text = (
            f"misses by {difference:+.3f}, outside the stated tolerance of "
            f"+/-{DELTA_TOLERANCE:g}"
        )
    if contains:
        text += "; the bootstrap interval still contains the quoted value, so this is a statement "
        text += "about precision as much as about the value"
    return {"state": state, "difference": difference, "contains": contains, "text": text}


# --- the document ----------------------------------------------------------------------------


def toom_series(lattices: tuple[int, ...], cap: int) -> dict[str, list[dict[str, object]]]:
    """Lifetime at every (rule, lattice, noise) on the grid, with each seed's own run."""
    series: dict[str, list[dict[str, object]]] = {"nec": [], "symmetric": []}
    for rule in ("nec", "symmetric"):
        for lattice in lattices:
            for noise in NOISE_GRID:
                runs = []
                for seed in TOOM_SEEDS:
                    steps, capped = toom_lifetime(lattice, noise, seed, rule=rule, cap=cap)
                    runs.append({"seed": seed, "lifetime": steps, "capped": capped})
                lifetimes = sorted(run["lifetime"] for run in runs)
                median = lifetimes[len(lifetimes) // 2]
                capped_count = sum(1 for run in runs if run["capped"])
                series[rule].append(
                    {
                        "lattice": lattice,
                        "noise": noise,
                        "runs": runs,
                        "median": median,
                        "capped": capped_count,
                        "lower_bound": capped_count > 0,
                    }
                )
    return series


def dk_diagram(lattice: int, steps: int, seeds: tuple[int, ...]) -> list[dict[str, object]]:
    cells = []
    for i in range(DK_GRID + 1):
        for j in range(DK_GRID + 1):
            p1 = i / DK_GRID
            p2 = j / DK_GRID
            result = dk_survival(lattice, p1, p2, seeds, steps)
            cells.append({"p1": p1, "p2": p2, **result})
    return cells


def build_document(
    *,
    cap: int = TOOM_CAP,
    toom_lattices: tuple[int, ...] = TOOM_LATTICES,
    diagram_lattice: int = DK_DIAGRAM_LATTICE,
    diagram_steps: int = DK_DIAGRAM_STEPS,
    decay_lattices: tuple[int, ...] = DK_DECAY_LATTICES,
    decay_steps: int = DK_DECAY_STEPS,
) -> dict[str, object]:
    """The whole panel. Same arguments, same bytes: every run carries the seed that made it."""
    series = toom_series(toom_lattices, cap)
    diagram = dk_diagram(diagram_lattice, diagram_steps, DK_DIAGRAM_SEEDS)
    fits = [
        decay_fit(lattice, DK_DECAY_SEEDS, decay_steps, DK_FIT_WINDOW)
        for lattice in decay_lattices
    ]
    judgements = [verdict(fit) for fit in fits]
    return {
        "version": PANEL_VERSION,
        "generator": "python -m computation_atlas.stress",
        "noise": {
            "grid": list(NOISE_GRID),
            "note": "dyadic m/2^k, so each value is exact and no probability is rounded",
        },
        "toom": {
            "cap": cap,
            "lattices": list(toom_lattices),
            "seeds": list(TOOM_SEEDS),
            "loss": (
                "the bit is lost when fewer than half the cells still hold the initial value; "
                "a run that reaches the cap is a lower bound, drawn as >= cap"
            ),
            "nec": series["nec"],
            "symmetric": series["symmetric"],
            "claim": CITED["toom"],
        },
        "dk": {
            "grid": DK_GRID,
            "diagram_lattice": diagram_lattice,
            "diagram_steps": diagram_steps,
            "diagram_seeds": list(DK_DIAGRAM_SEEDS),
            "critical": {"p1": DK_CRITICAL[0], "p2": DK_CRITICAL[1]},
            "literature": {
                "bond": {"p1": DK_CRITICAL[0], "p2": DK_CRITICAL[1], "pc": BOND_PC},
                "site": {"p1": SITE_PC, "p2": SITE_PC, "pc": SITE_PC},
            },
            "cells": diagram,
            "decay": {
                "lattices": list(decay_lattices),
                "seeds": list(DK_DECAY_SEEDS),
                "steps": decay_steps,
                "window": list(DK_FIT_WINDOW),
                "initial_density": 0.5,
                "bond_pc_quoted": BOND_PC,
                "bond_pc_used": BOND_PC_NUM / BOND_PC_DEN,
                "bond_pc_grid": [BOND_PC_NUM, BOND_PC_DEN],
                "delta_dp": DELTA_DP,
                "delta_dp_se": DELTA_DP_SE,
                "tolerance": DELTA_TOLERANCE,
                "fits": [
                    {**fit, "verdict": judgement}
                    for fit, judgement in zip(fits, judgements, strict=True)
                ],
                "claim": CITED["delta"],
            },
            "claim_pc": CITED["pc"],
        },
    }


def serialize(document: dict[str, object]) -> str:
    """Canonical text: sorted keys, one-space indent, trailing newline."""
    return json.dumps(document, sort_keys=True, indent=1) + "\n"


def write_panel(out_dir: str | Path, **kwargs: object) -> Path:
    document = build_document(**kwargs)  # type: ignore[arg-type]
    path = Path(out_dir) / "panel.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(serialize(document), encoding="utf-8", newline="\n")
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write the Stress Lab panel product.")
    parser.add_argument(
        "--out", default="products/stress", help="directory to write panel.json into"
    )
    parser.add_argument("--cap", type=int, default=TOOM_CAP)
    args = parser.parse_args(argv)
    path = write_panel(args.out, cap=args.cap)
    print(path)
    return 0


if __name__ == "__main__":  # pragma: no cover - exercised by the pipeline, not by pytest
    raise SystemExit(main())
