"""The chart geometry is the thing every figure depends on, so it gets pinned."""

from __future__ import annotations

import pytest

from computation_atlas.space import (
    CHART,
    LANDMARKS,
    index_of,
    landmark_cells,
    mask_at,
    rule_at,
    sample_layout,
    sample_windows,
)


@pytest.mark.parametrize("index", [0, 1, 2, 3, 7, 12, 15, 108, 300, 511])
def test_gray_code_round_trips(index: int) -> None:
    assert index_of(mask_at(index)) == index


def test_gray_neighbours_differ_by_one_bit() -> None:
    # The whole point of the chart: a one-pixel move is a one-bit rule edit.
    for index in range(0, CHART - 1):
        difference = mask_at(index) ^ mask_at(index + 1)
        assert difference & (difference - 1) == 0, f"index {index} is not adjacent by one bit"


def test_landmarks_agree_with_their_coordinates() -> None:
    for landmark in LANDMARKS:
        landmark.verify()
    # Spelled out once, so a re-index cannot quietly relabel the map.
    assert rule_at(15, 8).canonical() == "B3/S23"
    assert rule_at(112, 8).canonical() == "B36/S23"
    assert rule_at(7, 0).canonical() == "B2/S"
    assert rule_at(index_of(456), index_of(472)).canonical() == "B3678/S34678"


def test_windows_stay_on_the_chart_and_contain_their_landmark() -> None:
    windows = sample_windows(32)
    assert len(windows) == len(LANDMARKS)
    for window, landmark in zip(windows, LANDMARKS, strict=True):
        assert 0 <= window.birth_start <= CHART - window.size
        assert 0 <= window.survival_start <= CHART - window.size
        assert window.birth_start <= landmark.birth_index < window.birth_stop
        assert window.survival_start <= landmark.survival_index < window.survival_stop


def test_layout_is_a_full_tile_with_no_repeated_coordinate() -> None:
    cells = sample_layout(32)
    assert len(cells) == 64 * 64
    positions = {(cell.x, cell.y) for cell in cells}
    assert len(positions) == 64 * 64
    assert {cell.x for cell in cells} == set(range(64))
    assert {cell.y for cell in cells} == set(range(64))


def test_landmark_cells_point_at_the_landmark_rules() -> None:
    cells = landmark_cells(32)
    for landmark in LANDMARKS:
        cell = cells[landmark.name]
        assert cell.rule == landmark.rule
        assert cell.birth_index == landmark.birth_index
