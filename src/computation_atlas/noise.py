"""The atlas under noise: does a rule's structure survive an error rate? (design §3.4 panel 4)

One number per rule, per noise level: **excess neighbour agreement**. A uniform field and a field
indistinguishable from random at its own density both score 0, so "nothing survives" and "everything
boiled away" are the same reading, which is what the map is for. The statistic is normalised by
density, so a sparse still life is not punished for being sparse:

    agree = fraction of horizontal and vertical neighbour pairs that match
    baseline = rho^2 + (1 - rho)^2        (the agreement of a random field at density rho)
    score = (agree - baseline) / (1 - baseline)

The sweep is a coarse instrument and says so: every rule is run on one 16x16 torus from one seeded
soup, for 24 steps, and every rule sees the *same* noise realisation (common random numbers), so
neighbouring rules differ by their dynamics rather than by their weather. The chart is sampled every
fourth index; the page draws each sample over the 4x4 chart cells it stands for.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from pathlib import Path

from .reference import soup
from .rules import LifeLike
from .space import rule_at

CHART = 512
SAMPLE = 4
GRID = CHART // SAMPLE
LATTICE = 16
STEPS = 24
# Dyadic on purpose: each rate is exact, and the page's slider is in the same units.
ANCHORS: tuple[tuple[int, int], ...] = ((0, 1), (1, 64), (1, 32), (1, 8))
SLIDER_UNIT = 1024
SOUP_SEED = 11
NOISE_SEED = 23
STRUCTURE_THRESHOLD = 0.10
MANIFEST_VERSION = 1

STATISTIC = (
    "excess neighbour agreement (agree - baseline) / (1 - baseline), where agree is the fraction "
    "of horizontal and vertical neighbour pairs that match and baseline = rho^2 + (1 - rho)^2. "
    "Zero means the field is uniform or statistically indistinguishable from a random field at "
    "that density; one means every neighbour pair matches."
)

NOTE = (
    "One 16x16 torus, one seeded soup and one noise realisation per level, shared by every rule "
    "(common random numbers), 24 steps. The chart is sampled every fourth index and each sample "
    "is drawn over the 4x4 chart cells it stands for. A coarse indicator, not a classification."
)


class Lattice:
    """A torus packed into one integer, four bits per cell.

    The four-bit lane is what makes the neighbour count a plain sum: eight single-bit terms can
    reach 8 and never carry out of a lane, so the count can be read back as four bit planes.
    """

    def __init__(self, size: int) -> None:
        self.size = size
        self.cells = size * size
        full = first = last = 0
        for y in range(size):
            for x in range(size):
                bit = 1 << (4 * (y * size + x))
                full |= bit
                if x == 0:
                    first |= bit
                if x == size - 1:
                    last |= bit
        row0 = 0
        for x in range(size):
            row0 |= 1 << (4 * x)
        self.full = full
        self.first = first
        self.last = last
        self.row0 = row0
        self.lastrow = row0 << (4 * size * (size - 1))
        self.hstep = 4 * (size - 1)
        self.vstep = 4 * size
        self.vwrap = 4 * size * (size - 1)

    def east(self, state: int) -> int:
        return ((state << 4) & ~self.first) | ((state >> self.hstep) & self.first)

    def west(self, state: int) -> int:
        return ((state >> 4) & ~self.last) | ((state << self.hstep) & self.last)

    def north(self, state: int) -> int:
        return ((state << self.vstep) & self.full) | ((state >> self.vwrap) & self.row0)

    def south(self, state: int) -> int:
        return ((state >> self.vstep) & self.full) | ((state << self.vwrap) & self.lastrow)

    def step(self, state: int, birth: int, survival: int) -> int:
        east, west = self.east(state), self.west(state)
        north, south = self.north(state), self.south(state)
        count = (
            east
            + west
            + north
            + south
            + self.east(north)
            + self.west(north)
            + self.east(south)
            + self.west(south)
        )
        full = self.full
        plane0 = count & full
        plane1 = (count >> 1) & full
        plane2 = (count >> 2) & full
        plane3 = (count >> 3) & full
        not3 = full ^ plane3
        born = keep = 0
        for neighbours in range(8):
            if not ((birth | survival) >> neighbours) & 1:
                continue
            mask = plane0 if neighbours & 1 else plane0 ^ full
            mask &= plane1 if neighbours & 2 else plane1 ^ full
            mask &= plane2 if neighbours & 4 else plane2 ^ full
            mask &= not3
            if (birth >> neighbours) & 1:
                born |= mask
            if (survival >> neighbours) & 1:
                keep |= mask
        if (birth >> 8) & 1:
            born |= plane3
        if (survival >> 8) & 1:
            keep |= plane3
        return (born & (full ^ state)) | (keep & state)


def soup_state(lattice: Lattice, seed: int) -> int:
    """The pipeline's own soup (xorshift32), packed into the lattice's four-bit lanes."""
    state = 0
    for index, cell in enumerate(soup(lattice.size, lattice.size, seed)):
        if cell:
            state |= 1 << (4 * index)
    return state


def noise_masks(
    lattice: Lattice, numerator: int, denominator: int, steps: int, seed: int
) -> list[int]:
    """One flip mask per step. Dyadic rates are exact, so the comparison is exact too."""
    rng = random.Random(seed)
    probability = numerator / denominator
    masks: list[int] = []
    for _ in range(steps):
        mask = 0
        if numerator:
            for index in range(lattice.cells):
                if rng.random() < probability:
                    mask |= 1 << (4 * index)
        masks.append(mask)
    return masks


def structure(state: int, lattice: Lattice) -> tuple[float, float]:
    """(density, excess agreement). Uniform and random fields both read zero."""
    cells = lattice.cells
    density = (state & lattice.full).bit_count() / cells
    equal = (
        (~(state ^ lattice.east(state)) & lattice.full).bit_count()
        + (~(state ^ lattice.south(state)) & lattice.full).bit_count()
    ) / (2 * cells)
    baseline = density * density + (1.0 - density) ** 2
    if baseline >= 0.999:
        return density, 0.0
    return density, min(1.0, max(0.0, (equal - baseline) / (1.0 - baseline)))


def run(
    lattice: Lattice, masks: list[int], rule: LifeLike, soup_seed: int
) -> tuple[float, float]:
    """Step the rule under the given noise and read the final field."""
    state = soup_state(lattice, soup_seed)
    birth = rule.mask & 0x1FF
    survival = (rule.mask >> 9) & 0x1FF
    for mask in masks:
        state = lattice.step(state, birth, survival) ^ mask
    return structure(state, lattice)


def score(lattice: Lattice, masks: list[int], rule: LifeLike, soup_seed: int) -> int:
    """The stored byte: the statistic on a 0..255 scale."""
    return round(255 * run(lattice, masks, rule, soup_seed)[1])


def survival_grid(lattice: Lattice, masks: list[int], soup_seed: int) -> bytes:
    """The whole chart sample, row-major: x is the birth index, y the survival index."""
    out = bytearray(GRID * GRID)
    for row in range(GRID):
        for column in range(GRID):
            rule = rule_at(column * SAMPLE, row * SAMPLE)
            out[row * GRID + column] = score(lattice, masks, rule, soup_seed)
    return bytes(out)


def build_manifest(out_dir: str | Path) -> dict[str, object]:
    directory = Path(out_dir)
    directory.mkdir(parents=True, exist_ok=True)
    lattice = Lattice(LATTICE)
    anchors: list[dict[str, object]] = []
    for index, (numerator, denominator) in enumerate(ANCHORS):
        masks = noise_masks(lattice, numerator, denominator, STEPS, NOISE_SEED)
        data = survival_grid(lattice, masks, SOUP_SEED)
        name = f"survival-{index}.bin"
        (directory / name).write_bytes(data)
        collapsed = sum(1 for value in data if value / 255 < STRUCTURE_THRESHOLD) / len(data)
        anchors.append(
            {
                "num": numerator,
                "den": denominator,
                "eps": numerator / denominator,
                "path": name,
                "bytes": len(data),
                "collapsed_fraction": collapsed,
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        )
    manifest: dict[str, object] = {
        "version": MANIFEST_VERSION,
        "kind": "noise-overlay",
        "generator": "python -m computation_atlas.noise",
        "chart": CHART,
        "sample": SAMPLE,
        "grid": GRID,
        "lattice": LATTICE,
        "steps": STEPS,
        "soup_seed": SOUP_SEED,
        "noise_seed": NOISE_SEED,
        "slider_unit": SLIDER_UNIT,
        "threshold": STRUCTURE_THRESHOLD,
        "statistic": STATISTIC,
        "note": NOTE,
        "anchors": anchors,
    }
    path = directory / "manifest.json"
    path.write_text(json.dumps(manifest, sort_keys=True, indent=1) + "\n", encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write the atlas noise overlay product.")
    parser.add_argument("--out", default="products/noise", help="directory to write into")
    args = parser.parse_args(argv)
    build_manifest(args.out)
    print(Path(args.out) / "manifest.json")
    return 0


if __name__ == "__main__":  # pragma: no cover - exercised by the pipeline, not by pytest
    raise SystemExit(main())
