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


A_UNIT = (3, 2)
B_UNIT = (4, -2)
PRIMITIVE_GLIDERS: dict[str, tuple[int, int]] = {
    "A": (1, 0),
    "B": (0, 1),
    "C": (1, 1),
    "D": (2, 1),
    "E": (1, 3),
    "F": (4, 6),
}
GLIDER_WINDOW = 16
GLIDER_SETTLE = 100
GLIDER_REPEATS = 3


def cook_period(units: tuple[int, int]) -> tuple[int, int]:
    """Cook's ``(A, B)`` combination as a signed ``(time, displacement)`` pair.

    The table prints displacements as magnitudes. The sign follows from the B unit: a B glider
    travels left, so its unit is ``(4, -2)`` and every combination that uses it moves left too.
    """
    return (
        units[0] * A_UNIT[0] + units[1] * B_UNIT[0],
        units[0] * A_UNIT[1] + units[1] * B_UNIT[1],
    )


def is_ether(window: bytes) -> bool:
    return any(
        all(
            window[k] == int(ETHER[(k + phase) % SPATIAL_PERIOD]) for k in range(len(window))
        )
        for phase in range(SPATIAL_PERIOD)
    )


def repeats(rows: tuple[bytes, ...], t: int, x: int, period: tuple[int, int]) -> bool:
    """True when the window at ``(t, x)`` repeats for three consecutive periods."""
    tau, dx = period
    width = len(rows[0])
    sample = (rows[t] + rows[t])[x : x + GLIDER_WINDOW]
    for k in range(1, GLIDER_REPEATS + 1):
        row = rows[t + k * tau]
        position = (x + k * dx) % width
        if (row + row)[position : position + GLIDER_WINDOW] != sample:
            return False
    return True


def minimal_period(rows: tuple[bytes, ...], t: int, x: int) -> tuple[int, int] | None:
    """The smallest ``(time, displacement)`` the window repeats at, up to the cap."""
    width = len(rows[0])
    sample = (rows[t] + rows[t])[x : x + GLIDER_WINDOW]
    for tau in range(1, 101):
        if t + GLIDER_REPEATS * tau >= len(rows):
            continue
        for dx in range(-20, 21):
            if all(
                (rows[t + k * tau] + rows[t + k * tau])[
                    (x + k * dx) % width : (x + k * dx) % width + GLIDER_WINDOW
                ]
                == sample
                for k in range(1, GLIDER_REPEATS + 1)
            ):
                return tau, dx
    return None


def test_cooks_glider_periods_are_reproduced() -> None:
    """Cook (2004) Figure 5's periods, measured rather than quoted.

    The table gives each period as a positive combination of the A and B units. Only the primitive
    periods are tested: B-bar is three B units and E-bar is two E units, so a single B or E glider
    would satisfy those rows without a second kind of glider existing. G and H are rare enough
    that they do not settle in this run; they are not claimed.
    """
    rows = spacetime(elementary(110), 210, 480, 11)
    for name, units in PRIMITIVE_GLIDERS.items():
        expected = cook_period(units)
        found = None
        for t in range(GLIDER_SETTLE, len(rows) - GLIDER_REPEATS * expected[0]):
            for x in range(len(rows[0])):
                sample = (rows[t] + rows[t])[x : x + GLIDER_WINDOW]
                if is_ether(sample) or not repeats(rows, t, x, expected):
                    continue
                if minimal_period(rows, t, x) == expected:
                    found = (t, x)
                    break
            if found is not None:
                break
        assert found is not None, f"no {name} glider with period {expected} in the run"
