"""The panel product: what the page is allowed to draw, and what it must refuse to draw."""

from __future__ import annotations

import json

from computation_atlas.panel import build, build_document, filtered_field, pack_bits, unpack_bits


def test_bit_packing_round_trips_a_ragged_width() -> None:
    rows = [bytes([0, 1] * 5 + [1]), bytes([1] * 11)]
    assert unpack_bits(pack_bits(rows), 11, 2) == rows


def test_rule_18_ships_a_verified_claim_and_a_residue() -> None:
    panel = build(18, width=128, steps=96, seed=11)
    assert panel["claim"] is not None
    assert panel["claim"]["verified"] is True
    assert panel["region"] is not None
    assert panel["region"]["wall_fraction"] <= 0.125
    assert panel["fields"]["filtered"] is not None
    assert panel["fields"]["raw"] != panel["fields"]["filtered"]
    assert panel["tracks"], "the wall residue is what a visitor clicks"


def test_rule_30_ships_no_domain_and_no_invented_field() -> None:
    panel = build(30, width=128, steps=96, seed=11)
    assert panel["claim"] is None
    assert panel["periodic"] is None
    assert panel["region"] is None
    assert panel["fields"]["filtered"] is None, (
        "no domain means nothing to filter, not an empty picture"
    )
    assert panel["tracks"] == []
    assert panel["collisions"] == []


def test_rule_36_is_recovered_by_both_detectors() -> None:
    panel = build(36, width=128, steps=96, seed=11)
    assert panel["periodic"] is not None
    assert panel["periodic"]["pattern"] == [0, None, None, 0]
    assert panel["region"] is not None
    assert panel["region"]["wall_fraction"] <= 0.125
    assert panel["fields"]["filtered"] is not None


def test_every_field_decodes_to_the_window_the_metadata_claims() -> None:
    panel = build(18, width=64, steps=40, seed=5)
    width, rows = panel["width"], panel["steps"] + 1 - panel["settle"]
    assert len(unpack_bits(panel["fields"]["raw"], width, rows)) == rows
    assert len(unpack_bits(panel["fields"]["filtered"], width, rows)) == rows
    assert len(unpack_bits(panel["fields"]["damage"], width, rows)) == rows


def test_the_product_is_deterministic_for_a_seed() -> None:
    first = build_document((18, 30), width=64, steps=40, seed=3)
    again = build_document((18, 30), width=64, steps=40, seed=3)
    other = build_document((18, 30), width=64, steps=40, seed=4)
    assert json.dumps(first, sort_keys=True) == json.dumps(again, sort_keys=True)
    assert json.dumps(first, sort_keys=True) != json.dumps(other, sort_keys=True)


def test_damage_starts_at_the_flipped_cell() -> None:
    panel = build(18, width=64, steps=32, seed=9)
    rows = unpack_bits(panel["fields"]["damage"], 64, panel["steps"] + 1 - panel["settle"])
    assert sum(rows[0]) == 1, "one flipped cell on the first observed row"
    assert sum(rows[-1]) >= sum(rows[0]), "damage spreads, it does not shrink"


def test_a_rule_with_no_domain_has_no_residue_argument_to_make() -> None:
    from computation_atlas.inspector import elementary, infer_domain, infer_phase_domain, spacetime

    rows = spacetime(elementary(30), 64, 40, 11)
    assert filtered_field(rows[8:], infer_domain(rows), infer_phase_domain(rows[8:])) is None
