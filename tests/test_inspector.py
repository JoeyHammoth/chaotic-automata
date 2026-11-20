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
    calibrate,
    chi2_critical,
    claim,
    domain_tiling,
    domain_violations,
    elementary,
    from_number,
    infer_domain,
    infer_phase_domain,
    inspect,
    local_causal_states,
    particle_count,
    particles,
    seed_row,
    shuffled,
    spacetime,
    spacetime_from,
    spatial_inference,
    spatial_machine,
    track,
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


def test_rule_18_domain_is_regions_between_walls() -> None:
    report = inspect(18, width=256, steps=256, seed=SEED)
    assert report.domain is None, "no single phase holds across the whole row"
    region = report.region_domain
    assert region is not None, "the two-phase (0 Sigma)* domain is recovered"
    assert region.rows > 100
    assert 0 < region.walls_mean < 16
    assert region.wall_fraction <= 0.08
    assert "regions separated by walls" in report.decomposition
    found = claim(18)
    assert found is not None
    assert found.verified, "the claim is reproduced once it is read as a domain, not a row pattern"
    assert not report.particles_measured, "tracks still need a filtered field, not just a tiling"


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

def diagonal(width: int, height: int) -> list[bytes]:
    field = []
    for t in range(height):
        row = bytearray(width)
        row[t % width] = 1
        field.append(bytes(row))
    return field


def test_a_glider_reports_its_measured_period() -> None:
    tracks = track(diagonal(16, 8), min_cells=4).particles
    assert len(tracks) == 1
    assert tracks[0].period == (1, 1)
    assert tracks[0].velocity == pytest.approx(1.0)


def test_two_tracks_meeting_record_one_merge() -> None:
    width, height = 16, 7
    field = []
    for t in range(height):
        row = bytearray(width)
        if t < 4:
            row[t % width] = 1
            row[(8 - t) % width] = 1
        else:
            row[4] = 1
        field.append(bytes(row))
    events = track(field, min_cells=3).collisions
    merges = [event for event in events if event.kind == "merge"]
    assert len(merges) == 1
    assert merges[0].time == 4
    assert len(merges[0].inputs) == 2
    assert len(merges[0].outputs) == 1


def test_particle_count_requires_a_period_and_a_lifetime() -> None:
    field = diagonal(16, 8)
    assert particle_count(field, min_lifetime=4) == 1
    assert particle_count(field, min_lifetime=8) == 0


def test_calibration_separates_rule_18_from_its_shuffled_null() -> None:
    report = calibrate(18, width=96, steps=64, seeds=20)
    assert report.seeds == 20
    assert report.real_mean > report.null_mean
    assert report.false_positive_rate == 0.0
    assert report.passes
    assert report.state_interval.low <= report.state_interval.mean
    assert report.state_interval.mean <= report.state_interval.high


def test_calibration_reports_no_separation_rather_than_a_pass() -> None:
    report = calibrate(36, width=96, steps=64, seeds=20)
    assert not report.separates
    assert not report.passes


def test_a_phase_flip_costs_one_wall_and_no_violations() -> None:
    row = bytes(
        (0 if i % 2 == 0 else 1) if i < 32 else (0 if i % 2 == 1 else 1) for i in range(64)
    )
    tiled = domain_tiling(row)
    assert tiled.violations == 0
    assert tiled.coverage == 1.0
    assert len(tiled.walls) == 2, "one wall where the phase flips, one at the seam"
    assert 32 in tiled.walls


def test_the_tiling_does_not_invent_a_domain_for_rule_30() -> None:
    rows = spacetime(elementary(30), 128, 128, SEED)[8:]
    assert infer_phase_domain(rows) is None
    tilings = [domain_tiling(row) for row in rows]
    assert all(tiling.violations == 0 for tiling in tilings), "a tiling always exists"
    assert sum(len(tiling.walls) for tiling in tilings) / len(tilings) > 128 // 8


def test_the_two_detectors_agree_on_rule_36() -> None:
    rows = spacetime(elementary(36), WIDTH, STEPS, SEED)
    domain = infer_domain(rows)
    assert domain is not None
    assert domain.pattern == (0, None, None, 0)
    region = infer_phase_domain(rows[8:])
    assert region is not None
    assert 0 < region.walls_mean <= 8


def test_spatial_machine_recovers_a_two_state_cycle_on_an_exact_language() -> None:
    row = bytes(0 if i % 2 == 0 else 1 for i in range(128))
    machine = spatial_machine([row], history=4, min_count=16)
    assert machine.count == 2
    assert len(machine.forcing) == 1
    cycle = machine.deterministic_cycle()
    assert cycle is not None
    assert len(cycle) == 2
    assert set(cycle) == {0, 1}


def test_state_counts_are_reported_across_seeds() -> None:
    result = spatial_inference(18, width=128, steps=128, seeds=3, history=4, min_count=32)
    assert len(result.state_counts) == 3
    assert result.tiled
    assert all(count >= 2 for count in result.state_counts)
    assert result.walls_mean > 0
    assert result.state_interval.low <= result.state_interval.mean <= result.state_interval.high
