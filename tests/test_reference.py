"""The reference stepper is a real implementation, so it gets real tests.

Its job is to be obviously correct, which is what makes it useful as an oracle.
"""

from __future__ import annotations

import pytest

from computation_atlas.reference import Grid, soup
from computation_atlas.rules import LifeLike, RuleError

W = 64
H = 64


def grid_with(points: list[tuple[int, int]]) -> bytes:
    cells = bytearray(W * H)
    for x, y in points:
        cells[y * W + x] = 1
    return bytes(cells)


def live(cells: bytes) -> list[tuple[int, int]]:
    return [(index % W, index // W) for index, cell in enumerate(cells) if cell == 1]


@pytest.mark.parametrize(
    ("text", "canonical"),
    [
        ("B3/S23", "B3/S23"),
        ("b3/s23", "B3/S23"),
        ("  B3/S23  ", "B3/S23"),
        ("B33/S233", "B3/S23"),
        ("B2/S", "B2/S"),
        ("B/S", "B/S"),
        ("B0/S8", "B0/S8"),
        ("B012345678/S012345678", "B012345678/S012345678"),
    ],
)
def test_canonical_form_matches_the_rust_engine(text: str, canonical: str) -> None:
    rule = LifeLike.parse(text)
    assert rule.canonical() == canonical
    assert LifeLike.parse(rule.canonical()) == rule


def test_mask_round_trips() -> None:
    for text in ["B3/S23", "B0/S", "B/S012345678", "B36/S23"]:
        rule = LifeLike.parse(text)
        assert LifeLike.from_mask(rule.mask) == rule
    # birth B3 at bit 3; survival S23 at bits 9+2 and 9+3.
    assert LifeLike.life().mask == (1 << 3) | (1 << 11) | (1 << 12)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("", "empty"),
        ("B3", "one '/'"),
        ("B3/S23/1", "one '/'"),
        ("B9/S23", "out of range"),
        ("B3/S2x", "not a digit"),
        ("3/23", "expected 'B'"),
    ],
)
def test_malformed_rules_are_rejected(text: str, expected: str) -> None:
    with pytest.raises(RuleError, match=expected.replace("'", "'")):
        LifeLike.parse(text)


def test_block_is_a_still_life() -> None:
    points = [(10, 10), (11, 10), (10, 11), (11, 11)]
    grid = Grid(LifeLike.life(), W, H, grid_with(points))
    grid.step(10)
    assert live(grid.cells()) == points


def test_blinker_has_period_two() -> None:
    vertical = [(10, 9), (10, 10), (10, 11)]
    grid = Grid(LifeLike.life(), W, H, grid_with(vertical))
    grid.step(1)
    assert live(grid.cells()) == [(9, 10), (10, 10), (11, 10)]
    grid.step(1)
    assert live(grid.cells()) == vertical


def test_glider_translates_one_one_in_four_steps() -> None:
    start = [(11, 10), (12, 11), (10, 12), (11, 12), (12, 12)]
    grid = Grid(LifeLike.life(), W, H, grid_with(start))
    grid.step(4)
    assert live(grid.cells()) == [(12, 11), (13, 12), (11, 13), (12, 13), (13, 13)]


def test_soup_is_deterministic_and_dense() -> None:
    first = soup(32, 32, seed=7)
    assert first == soup(32, 32, seed=7)
    assert 100 < sum(first) < 400


def test_b0_rule_fills_an_empty_grid() -> None:
    grid = Grid(LifeLike.parse("B0/S"), W, H, bytes(W * H))
    grid.step(1)
    assert grid.population() == W * H


def test_digest_tracks_content() -> None:
    grid = Grid(LifeLike.life(), W, H, grid_with([(0, 0), (1, 0), (0, 1), (1, 1)]))
    before = grid.digest()
    grid.step(1)
    assert grid.digest() == before, "a block is unchanged, so its digest must be"

    blinker = Grid(LifeLike.life(), W, H, grid_with([(10, 9), (10, 10), (10, 11)]))
    blinker_before = blinker.digest()
    blinker.step(1)
    assert blinker.digest() != blinker_before
