"""Bootstrap determinism and the classification tree, including the cap rule (ADR 0003)."""

from __future__ import annotations

import math

import pytest

from computation_atlas.metrics import CLASS_CODES, bootstrap_interval, classify


def test_bootstrap_is_deterministic_and_brackets_the_mean() -> None:
    values = [0.1, 0.2, 0.15, 0.18, 0.12, 0.25]
    first = bootstrap_interval(values, seed=7)
    second = bootstrap_interval(values, seed=7)
    assert first == second
    assert first.low <= first.mean <= first.high
    assert math.isclose(first.mean, sum(values) / len(values))


def test_bootstrap_of_one_value_is_degenerate() -> None:
    interval = bootstrap_interval([0.42], seed=1)
    assert interval.mean == interval.low == interval.high == 0.42


def test_bootstrap_rejects_an_empty_sample() -> None:
    with pytest.raises(ValueError):
        bootstrap_interval([])


def test_a_capped_run_is_undecided_even_when_it_looks_chaotic() -> None:
    # The cap check comes first: activity and entropy cannot promote it to `chaotic`.
    assert (
        classify(
            activity=0.9,
            spatial_entropy=0.99,
            damage_died_rate=0.0,
            undecided_mass=0.5,
            period=None,
        )
        == "undecided"
    )


CASES: dict[str, dict[str, float | None]] = {
    "static": {"activity": 0.0, "spatial_entropy": 0.0, "damage_died_rate": 1.0, "period": 1.0},
    "periodic": {"activity": 0.01, "spatial_entropy": 0.1, "damage_died_rate": 1.0, "period": 2.0},
    "ordered": {"activity": 0.02, "spatial_entropy": 0.3, "damage_died_rate": 1.0, "period": None},
    "complex": {"activity": 0.05, "spatial_entropy": 0.4, "damage_died_rate": 0.0, "period": None},
    "chaotic": {"activity": 0.8, "spatial_entropy": 0.9, "damage_died_rate": 0.0, "period": None},
}


@pytest.mark.parametrize(("expected", "case"), list(CASES.items()))
def test_classification_tree(case: dict[str, float | None], expected: str) -> None:
    assert classify(undecided_mass=0.0, **case) == expected  # type: ignore[arg-type]


def test_class_codes_are_stable() -> None:
    assert CLASS_CODES["undecided"] == 5
    assert len(set(CLASS_CODES.values())) == len(CLASS_CODES)
