"""The Stress Lab's arithmetic: the bitset engine, the exact noise, and the verdict logic.

The page draws committed numbers, so these tests pin the things a wrong number could hide behind:
a shift helper that wraps into the next row, a noise mask whose rate is not the rate it claims, a
tie-break that silently changes the symmetric rule, and a fit that is reported as a measurement
when the run absorbed.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

import pytest

from computation_atlas.stress import (
    DELTA_DP,
    DK_CRITICAL,
    NOISE_GRID,
    _east,
    _north,
    _row_masks,
    _south,
    _west,
    bernoulli,
    build_document,
    dk_active,
    dk_run,
    dk_step,
    fit_exponent,
    majority3,
    serialize,
    toom_lifetime,
    toom_step,
    verdict,
)


def naive_shift(state: int, lattice: int, kind: str) -> int:
    """Per-cell reference for the four neighbour shifts, with no bit tricks at all."""
    out = 0
    for row in range(lattice):
        for column in range(lattice):
            source = {
                "east": (row, (column + 1) % lattice),
                "west": (row, (column - 1) % lattice),
                "north": ((row - 1) % lattice, column),
                "south": ((row + 1) % lattice, column),
            }[kind]
            if (state >> (source[0] * lattice + source[1])) & 1:
                out |= 1 << (row * lattice + column)
    return out


@pytest.mark.parametrize("lattice", [2, 3, 5, 8])
def test_shift_helpers_match_a_naive_reference(lattice: int) -> None:
    full, first, last = _row_masks(lattice)
    rng = random.Random(lattice)
    for _ in range(8):
        state = rng.getrandbits(lattice * lattice)
        assert _east(state, lattice, full, last) == naive_shift(state, lattice, "east")
        assert _west(state, lattice, full, first) == naive_shift(state, lattice, "west")
        assert _north(state, lattice) == naive_shift(state, lattice, "north")
        assert _south(state, lattice) == naive_shift(state, lattice, "south")


def test_majority3_is_the_bitwise_majority() -> None:
    for a in (0, 1):
        for b in (0, 1):
            for c in (0, 1):
                assert majority3(a, b, c) == (1 if a + b + c >= 2 else 0)


@pytest.mark.parametrize("numerator,denominator", [(1, 16), (1, 256), (3, 4), (5, 8)])
def test_bernoulli_mask_has_the_requested_rate(numerator: int, denominator: int) -> None:
    rng = random.Random(7)
    ones = total = 0
    for _ in range(40):
        mask = bernoulli(rng, 2048, numerator, denominator)
        ones += mask.bit_count()
        total += 2048
    assert abs(ones / total - numerator / denominator) < 0.01


def test_bernoulli_refuses_a_denominator_that_is_not_a_power_of_two() -> None:
    with pytest.raises(ValueError, match="power of two"):
        bernoulli(random.Random(1), 64, 1, 3)


def test_nec_heals_a_single_defect_in_one_step() -> None:
    lattice = 8
    state = ((1 << (lattice * lattice)) - 1) ^ (1 << 27)
    assert toom_step(state, lattice, "nec") == (1 << (lattice * lattice)) - 1


def test_a_uniform_lattice_is_a_fixed_point() -> None:
    lattice = 6
    full = (1 << (lattice * lattice)) - 1
    assert toom_step(full, lattice, "nec") == full


def test_the_symmetric_rule_needs_its_coin_on_a_full_row() -> None:
    """A row of ones is all ties: each of its cells sees E and W set, N and S clear.

    A straight *vertical* interface is not the test, because on a ring its cells see three of one
    value and one of the other. The tie-break is what lets the interface wander, and that is why
    the symmetric rule loses the stored bit while NEC keeps it.
    """
    lattice = 6
    row = sum(1 << (2 * lattice + column) for column in range(lattice))
    assert toom_step(row, lattice, "symmetric", coin=0) == 0
    assert toom_step(row, lattice, "symmetric", coin=(1 << (lattice * lattice)) - 1) == row


def test_noise_free_runs_never_lose_the_bit() -> None:
    for rule in ("nec", "symmetric"):
        steps, capped = toom_lifetime(8, 0.0, 11, rule=rule, cap=50)
        assert (steps, capped) == (50, True)


def test_a_run_that_reaches_the_cap_is_a_lower_bound() -> None:
    steps, capped = toom_lifetime(8, 1 / 32, 11, cap=40)
    assert capped is True
    assert steps == 40


def test_above_the_crossover_the_bit_is_lost_in_a_few_steps() -> None:
    for lattice in (8, 16):
        steps, capped = toom_lifetime(lattice, 1 / 4, 11, cap=4000)
        assert capped is False
        assert steps < 200


def test_below_the_crossover_the_lifetime_outruns_the_cap_at_every_lattice() -> None:
    for lattice in (8, 16):
        steps, capped = toom_lifetime(lattice, 1 / 32, 11, cap=600)
        assert (steps, capped) == (600, True), "a lower bound, not a lifetime"


def test_the_symmetric_rule_loses_the_bit_where_nec_keeps_it() -> None:
    """The contrast the panel exists to show, at the same noise and the same lattice."""
    nec_steps, nec_capped = toom_lifetime(8, 1 / 16, 11, rule="nec", cap=4000)
    sym_steps, sym_capped = toom_lifetime(8, 1 / 16, 11, rule="symmetric", cap=4000)
    assert nec_capped is True and nec_steps == 4000
    assert sym_capped is False
    assert sym_steps < nec_steps


def test_dk_is_absorbing_without_an_active_parent() -> None:
    assert dk_step(0, 16, 0.9, 0.9, random.Random(1)) == 0


def test_dk_with_certain_bonds_fills_the_neighbours_of_one_seed() -> None:
    state = dk_step(1 << 7, 16, 1.0, 1.0, random.Random(1))
    assert state.bit_count() == 2
    assert state == (1 << 6) | (1 << 8)


def test_dk_survival_separates_the_two_phases() -> None:
    active = dk_run(128, 0.75, 0.75, 11, 200)
    absorbing = dk_run(128, 0.25, 0.25, 11, 200)
    assert dk_active(active) is True
    assert dk_active(absorbing) is False
    assert absorbing[-1] == 0.0


def test_fit_exponent_recovers_a_synthetic_power_law() -> None:
    densities = [0.0] + [time**-0.4 for time in range(1, 200)]
    assert fit_exponent(densities, (10, 199)) == pytest.approx(0.4, abs=1e-9)


def test_fit_exponent_refuses_a_window_through_zeros() -> None:
    densities = [1.0] * 10 + [0.0] * 50
    assert fit_exponent(densities, (5, 59)) is None


def test_verdict_calls_a_miss_a_miss() -> None:
    assert verdict({"delta": 0.25, "se": 0.01})["state"] == "miss"
    assert verdict({"delta": DELTA_DP + 0.001, "se": 0.01})["state"] == "consistent"
    assert verdict({"delta": None})["state"] == "undecided"


def test_the_noise_grid_is_dyadic_and_exact() -> None:
    for value in NOISE_GRID:
        numerator = round(value * 256)
        assert value == numerator / 256


def test_the_document_carries_the_seeds_and_the_quoted_values() -> None:
    document = build_document(
        cap=20,
        toom_lattices=(4,),
        diagram_lattice=16,
        diagram_steps=5,
        decay_lattices=(64,),
        decay_steps=60,
    )
    assert document["generator"] == "python -m computation_atlas.stress"
    for series in ("nec", "symmetric"):
        for point in document["toom"][series]:
            assert {run["seed"] for run in point["runs"]} == {11, 23, 37}
            assert point["capped"] == sum(run["capped"] for run in point["runs"])
    assert document["toom"]["claim"]["verified"] is False
    assert document["dk"]["critical"] == {"p1": DK_CRITICAL[0], "p2": DK_CRITICAL[1]}
    assert document["dk"]["decay"]["delta_dp"] == DELTA_DP
    assert document["dk"]["decay"]["claim"]["verified"] is False
    assert document["dk"]["cells"], "the phase diagram must not be empty"
    assert document["dk"]["decay"]["fits"][0]["verdict"]["state"] in {
        "consistent",
        "miss",
        "undecided",
    }


REPO_ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.skipif(
    not (REPO_ROOT / "products" / "stress").exists(),
    reason="the committed stress product is absent",
)
def test_committed_panel_matches_its_generator() -> None:
    """The page draws committed figures, so the committed figures must still be reproducible."""
    committed = (REPO_ROOT / "products" / "stress" / "panel.json").read_text(encoding="utf-8")
    document = json.loads(committed)
    rebuilt = build_document(
        cap=document["toom"]["cap"],
        toom_lattices=tuple(document["toom"]["lattices"]),
        diagram_lattice=document["dk"]["diagram_lattice"],
        diagram_steps=document["dk"]["diagram_steps"],
        decay_lattices=tuple(document["dk"]["decay"]["lattices"]),
        decay_steps=document["dk"]["decay"]["steps"],
    )
    assert serialize(rebuilt) == committed, (
        "products/stress/panel.json is stale; rerun python -m computation_atlas.stress"
    )
