"""The noise overlay: kernel correctness, the statistic's meaning, and the committed bytes."""

from __future__ import annotations

import hashlib
import json
import random
from pathlib import Path

import pytest

from computation_atlas.noise import (
    ANCHORS,
    GRID,
    LATTICE,
    SAMPLE,
    STEPS,
    STRUCTURE_THRESHOLD,
    Lattice,
    noise_masks,
    run,
    score,
    soup_state,
    structure,
    survival_grid,
)
from computation_atlas.reference import Grid
from computation_atlas.rules import LifeLike
from computation_atlas.space import rule_at

PRODUCT = Path(__file__).resolve().parent.parent / "products" / "noise"


def bits_of(cells: bytes) -> int:
    state = 0
    for index, cell in enumerate(cells):
        if cell:
            state |= 1 << (4 * index)
    return state


@pytest.mark.parametrize(
    "mask",
    [
        8 | 12 << 9,  # Life
        0x3F,
        0x155,
        0x100 | 0x100 << 9,  # B8/S8 — the count that needs the fourth bit
        0o777777,
        0x1FF,
        0x1FF << 9,
    ],
)
def test_step_matches_the_reference_stepper(mask: int) -> None:
    rule = LifeLike.from_mask(mask)
    lattice = Lattice(8)
    grid = Grid.from_soup(rule, 8, 8, seed=3)
    state = soup_state(lattice, 3)
    for _ in range(6):
        grid.step()
        state = lattice.step(state, rule.mask & 0x1FF, (rule.mask >> 9) & 0x1FF)
    assert state == bits_of(grid.cells())


def test_count_eight_is_not_read_as_zero() -> None:
    """The bug this test exists for: three bit planes cannot tell 8 from 0."""
    rule = LifeLike.from_mask(0x100 | 0x100 << 9)  # B8/S8
    lattice = Lattice(6)
    state = soup_state(lattice, 5)
    for _ in range(4):
        state = lattice.step(state, rule.mask & 0x1FF, (rule.mask >> 9) & 0x1FF)
    grid = Grid.from_soup(rule, 6, 6, seed=5)
    grid.step(4)
    assert state == bits_of(grid.cells())


def test_noise_rate_is_the_rate() -> None:
    lattice = Lattice(16)
    masks = noise_masks(lattice, 1, 4, 24, seed=7)
    flips = sum(mask.bit_count() for mask in masks) / len(masks)
    assert 40 <= flips <= 90  # 64 expected from 256 cells at one quarter
    assert all(mask.bit_count() == 0 for mask in noise_masks(lattice, 0, 1, 4, seed=7))


def test_uniform_field_has_no_structure() -> None:
    lattice = Lattice(16)
    assert structure(0, lattice) == (0.0, 0.0)
    assert structure(lattice.full, lattice) == (1.0, 0.0)


def test_random_field_scores_near_zero() -> None:
    lattice = Lattice(16)
    rng = random.Random(5)
    state = 0
    for index in range(lattice.cells):
        if rng.random() < 0.3:
            state |= 1 << (4 * index)
    _, value = structure(state, lattice)
    assert abs(value) < 0.15


def test_a_still_life_scores_above_the_threshold() -> None:
    """Isolated 2x2 blocks are still lifes, and the score is 1/3 rather than 1.

    A random field at the same density reads 0, so the 1/3 is structure and not density. It is not 1
    because the statistic counts neighbour agreement, and the edge of a sparse block is a
    disagreement: density normalisation is what stops a big empty field from scoring highest.
    """
    lattice = Lattice(16)
    state = 0
    for block_y in range(4):
        for block_x in range(4):
            for dy in (0, 1):
                for dx in (0, 1):
                    x = block_x * 4 + dx
                    y = block_y * 4 + dy
                    state |= 1 << (4 * (y * 16 + x))
    density, value = structure(state, lattice)
    assert density == pytest.approx(0.25)
    assert value == pytest.approx(1 / 3, abs=0.01)
    assert value > STRUCTURE_THRESHOLD


def test_same_seeds_same_bytes() -> None:
    lattice = Lattice(LATTICE)
    first = survival_grid(lattice, noise_masks(lattice, 1, 32, STEPS, 5), 11)
    second = survival_grid(lattice, noise_masks(lattice, 1, 32, STEPS, 5), 11)
    third = survival_grid(lattice, noise_masks(lattice, 1, 32, STEPS, 6), 11)
    assert first == second
    assert first != third


def test_anchors_are_dyadic_and_ordered() -> None:
    rates = [numerator / denominator for numerator, denominator in ANCHORS]
    assert rates == sorted(rates)
    assert all(denominator & (denominator - 1) == 0 for _, denominator in ANCHORS)


def test_committed_product_matches_its_generator() -> None:
    manifest = json.loads((PRODUCT / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["grid"] == GRID
    assert manifest["sample"] == SAMPLE
    assert manifest["lattice"] == LATTICE
    assert len(manifest["anchors"]) == len(ANCHORS)
    lattice = Lattice(LATTICE)
    # Recompute a spread of cells rather than the whole grid: every cell is independent, so this
    # pins the generator to the committed bytes without spending the sweep's full runtime.
    probes = [(0, 0), (1, 0), (0, 1), (7, 13), (GRID - 1, GRID - 1), (40, 96)]
    for anchor in manifest["anchors"]:
        data = (PRODUCT / anchor["path"]).read_bytes()
        assert len(data) == anchor["bytes"] == GRID * GRID
        assert hashlib.sha256(data).hexdigest() == anchor["sha256"]
        masks = noise_masks(lattice, anchor["num"], anchor["den"], STEPS, manifest["noise_seed"])
        for column, row in probes:
            rule = rule_at(column * SAMPLE, row * SAMPLE)
            expected = score(lattice, masks, rule, manifest["soup_seed"])
            assert data[row * GRID + column] == expected, (anchor["eps"], column, row)
        collapsed = sum(1 for value in data if value / 255 < STRUCTURE_THRESHOLD) / len(data)
        assert collapsed == pytest.approx(anchor["collapsed_fraction"])


def test_the_overlay_gets_emptier_as_noise_rises() -> None:
    manifest = json.loads((PRODUCT / "manifest.json").read_text(encoding="utf-8"))
    fractions = [anchor["collapsed_fraction"] for anchor in manifest["anchors"]]
    assert fractions == sorted(fractions), fractions
    assert fractions[0] < fractions[-1]


def test_life_loses_structure_under_noise() -> None:
    lattice = Lattice(LATTICE)
    life = LifeLike.from_mask(8 | 12 << 9)
    quiet = run(lattice, noise_masks(lattice, 0, 1, STEPS, 23), life, 11)[1]
    loud = run(lattice, noise_masks(lattice, 1, 8, STEPS, 23), life, 11)[1]
    assert quiet > loud
