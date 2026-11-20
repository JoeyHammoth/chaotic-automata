"""Rule 110's ether: the periods Cook (2004) states, reproduced by this code.

Cook, *Universality in Elementary Cellular Automata*, Complex Systems **15** (2004) 1-40, §3.1:
"the ether has a horizontal period of 14", and the ether returns every 7 steps. The word is the one
Wolfram's *A New Kind of Science* prints: ``00010011011111``.

The temporal test runs on a ring of 14 cells. That is not a finite-size convenience: Cook's
statement is that the ether is unchanged by 7 steps together with a shift of 14 cells, and on a
period-14 ring a shift of 14 *is* the identity, so the ring tests the sentence as written. The
displacement itself is not asserted, because a rotation of a ring of the ether's own period cannot
be observed to be a rotation at all.
"""

from __future__ import annotations

from computation_atlas.inspector import Rule1D, elementary, spacetime, spacetime_from

ETHER = "00010011011111"
SPATIAL_PERIOD = 14
TEMPORAL_PERIOD = 7


def ether_ring() -> bytes:
    return bytes(int(cell) for cell in ETHER)


def rotate(row: bytes, shift: int) -> bytes:
    shift %= len(row)
    return row[shift:] + row[:shift]


def test_the_ether_word_is_a_ring_of_fourteen_cells() -> None:
    assert len(ether_ring()) == SPATIAL_PERIOD


def test_no_shorter_rotation_period_fits_the_ether() -> None:
    ring = ether_ring()
    fits = [shift for shift in range(1, SPATIAL_PERIOD) if rotate(ring, shift) == ring]
    assert fits == [], "14 is minimal; a smaller period would make the ether narrower"


def test_the_ether_returns_after_seven_steps_and_not_before() -> None:
    rows = spacetime_from(elementary(110), ether_ring(), TEMPORAL_PERIOD)
    assert rows[TEMPORAL_PERIOD] == ether_ring()
    assert [row for row in rows[1:TEMPORAL_PERIOD] if row == ether_ring()] == [], (
        "a period shorter than 7 would make this a different rule than the one Cook measured"
    )


def test_the_ether_is_what_a_random_row_settles_onto() -> None:
    rows = spacetime(elementary(110), 128, 96, 11)
    hits = [index for index, row in enumerate(rows) if (row + row).find(ether_ring()) != -1]
    assert hits, "rule 110 from a random row should reach the ether, not wander forever"
    assert hits[0] < len(rows), "the ether must be reached inside the recorded window"


def test_a_rule_that_is_not_110_does_not_satisfy_the_same_periods() -> None:
    """The goldens are specific to rule 110, not a property of every binary rule."""
    for number in (18, 30, 36):
        rule: Rule1D = elementary(number)
        rows = spacetime_from(rule, ether_ring(), TEMPORAL_PERIOD)
        assert rows[TEMPORAL_PERIOD] != ether_ring(), f"rule {number} should not fix the ether"
