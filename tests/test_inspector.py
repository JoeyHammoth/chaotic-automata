"""The Inspector's headless core, checked against oracles rather than against itself.

The Rule 90 test is the reason this module can be trusted at all: it compares a run against a
closed form. Everything downstream of it is held to the weaker standard the design allows, which
is that a structure is reported only when it holds exactly, and that an absence is reported as an
absence.
"""

from __future__ import annotations

import math

import pytest

from computation_atlas.inspector import (
    NO_DECOMPOSITION,
    chi2_critical,
    claim,
    domain_violations,
    elementary,
    from_number,
    infer_domain,
    inspect,
    local_causal_states,
    particles,
    seed_row,
    shuffled,
    spacetime,
    spacetime_from,
)

WIDTH = 128
STEPS = 96
SEED = 11


def pascal_at(row: int, distance: int) -> int:
    """Rule 90's single-seed triangle: cell ``d`` at time ``t`` is ``C(t, (t+d)/2)`` mod 2."""
    if (row + distance) % 2:
        return 0
    index = (row + distance) // 2
    if index < 0 or index > row:
        return 0
    return math.comb(row, index) % 2


def test_rule_90_is_the_xor_of_its_neighbours() -> None:
    rule = elementary(90)
    for seed in (1, 2, 3):
        row = seed_row(64, seed)
        stepped = rule.step(row)
        for i in range(len(row)):
            expected = row[(i - 1) % 64] ^ row[(i + 1) % 64]
            assert stepped[i] == expected


def test_rule_90_reproduces_pascal_mod_two() -> None:
    width, step_count, centre = 65, 32, 32
    initial = bytearray(width)
    initial[centre] = 1
    rows = spacetime_from(elementary(90), bytes(initial), step_count)
    for t, row in enumerate(rows):
        for i in range(width):
            assert row[i] == pascal_at(t, i - centre), f"row {t} cell {i}"


def test_spacetime_is_seeded_and_repeatable() -> None:
    first = spacetime(elementary(30), 64, 16, SEED)
    again = spacetime(elementary(30), 64, 16, SEED)
    other = spacetime(elementary(30), 64, 16, SEED + 1)
    assert first == again
    assert first != other
    assert len(first) == 17


def test_radius_two_rules_use_a_wide_table() -> None:
    rule = from_number(0, radius=2)
    assert rule.neighbourhoods == 32
    assert rule.step(seed_row(32, SEED)) == bytes(32)


def test_a_static_rule_has_a_trivial_domain_and_no_tracks() -> None:
    report = inspect(0, width=64, steps=32, seed=SEED)
    assert report.domain is not None
    assert report.domain.pattern == (0,)
    assert report.domain.coverage == 1.0
    assert report.particles_measured
    assert report.tracks == ()


def test_a_periodic_background_is_recovered_exactly() -> None:
    rows = spacetime(elementary(36), WIDTH, STEPS, SEED)
    domain = infer_domain(rows)
    assert domain is not None
    assert domain.period == 4
    assert domain.pattern == (0, None, None, 0)
    assert domain.coverage == 0.5
    assert domain_violations(rows, domain) == 0


def test_rule_30_is_refused_a_decomposition() -> None:
    report = inspect(30, width=WIDTH, steps=STEPS, seed=SEED)
    assert report.domain is None
    assert report.decomposition == NO_DECOMPOSITION
    assert report.claim is None
    assert not report.particles_measured
    assert report.tracks == ()


def test_rule_18_keeps_a_claim_it_has_not_earned() -> None:
    report = inspect(18, width=256, steps=256, seed=SEED)
    assert report.domain is None, "the design's (0 Sigma)* is not reproduced by this detector"
    assert report.decomposition == NO_DECOMPOSITION
    found = claim(18)
    assert found is not None
    assert found.verified is False
    assert not report.particles_measured


def test_shuffling_time_destroys_the_detected_domain() -> None:
    rows = spacetime(elementary(36), WIDTH, STEPS, SEED)
    assert infer_domain(rows) is not None
    assert infer_domain(shuffled(rows, 5)) is None


def test_chi2_critical_matches_published_values() -> None:
    assert chi2_critical(1, 0.05) == pytest.approx(3.841, abs=0.01)
    assert chi2_critical(7, 0.01) == pytest.approx(18.475, abs=0.2)


def test_particles_measure_a_synthetic_glider() -> None:
    width, height = 16, 8
    field = []
    for t in range(height):
        row = bytearray(width)
        row[t] = 1
        field.append(bytes(row))
    tracks = particles(field, min_cells=4)
    assert len(tracks) == 1
    track = tracks[0]
    assert track.start == 0
    assert track.end == height - 1
    assert track.lifetime == height - 1
    assert track.cells == height
    assert track.velocity == pytest.approx(1.0)


def test_local_causal_states_are_bounded_repeatable_and_account_for_themselves() -> None:
    rows = spacetime(elementary(36), 64, 32, SEED)
    states = local_causal_states(rows, past=2, future=1)
    assert states.past == 2
    assert states.future == 1
    assert states.count >= 1
    assert len(states.states) == len(rows)
    assert all(value >= 0 for row in states.complexity for value in row)
    decoded = sum(1 for row in states.states for state in row if state >= 0)
    assert decoded + states.undecided <= len(rows) * 64
    again = local_causal_states(rows, past=2, future=1)
    assert again.states == states.states
    assert again.count == states.count


def test_a_report_records_the_seed_it_used() -> None:
    report = inspect(36, width=64, steps=32, seed=97)
    assert report.seed == 97
    assert report.width == 64
    assert report.steps == 32
