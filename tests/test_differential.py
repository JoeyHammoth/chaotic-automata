"""The differential gate (ADR 0002), run as ``pytest -m differential``.

Needs ``cargo build -p ca-diff --release`` first, or ``CA_DIFF_BIN`` pointing at the binary. The
pipeline job runs ``-m "not differential"`` so a Python-only contributor is not blocked by Rust; the
dedicated CI job runs this file.

Larger local workload (CI stays fast):

    cargo build -p ca-diff --release
    CA_DIFF_BIN=target/release/ca-diff CA_DIFF_LATTICE=128 CA_DIFF_STEPS=40 pytest -m differential
"""

from __future__ import annotations

import os

import pytest

from computation_atlas import differential
from computation_atlas.rules import LifeLike

pytestmark = pytest.mark.differential

LATTICE = int(os.environ.get("CA_DIFF_LATTICE", "64"))
STEPS = int(os.environ.get("CA_DIFF_STEPS", "10"))
SEED = 42

# Life, HighLife, Seeds, B0 (birth on an empty neighbourhood), all-survive, Day & Night.
RULES = ["B3/S23", "B36/S23", "B2/S", "B0/S8", "B/S012345678", "B368/S238"]


@pytest.fixture(scope="module")
def binary() -> str:
    try:
        return str(differential.find_binary())
    except differential.EngineUnavailable as error:
        pytest.skip(str(error))


@pytest.mark.parametrize("rule", RULES)
def test_engine_matches_reference_bit_exactly(binary: str, rule: str) -> None:
    result = differential.compare(
        rule, seed=SEED, steps=STEPS, width=LATTICE, height=LATTICE, binary=binary
    )
    print(result.summary())
    assert result.agrees, f"diverged at cell {result.first_divergence}"
    assert result.engine.digest == result.reference_digest
    # The engine echoes the canonical rule, which must be the Python canonical form too.
    assert result.engine.rule == LifeLike.parse(rule).canonical()


def test_mutated_engine_fails_the_harness(binary: str) -> None:
    # A mutation the harness does not notice would make every other test here decorative.
    result = differential.compare(
        "B3/S23", seed=7, steps=3, width=LATTICE, height=LATTICE, mutate=True, binary=binary
    )
    assert result.engine.mutated
    assert not result.agrees, "the harness must reject a mutated engine"
    assert result.first_divergence == (0, 0)


def test_the_same_request_repeats(binary: str) -> None:
    first = differential.compare("B3/S23", 11, 5, LATTICE, LATTICE, binary=binary)
    second = differential.compare("B3/S23", 11, 5, LATTICE, LATTICE, binary=binary)
    assert first.engine.cells == second.engine.cells
    assert first.engine.digest == second.engine.digest


def test_both_sides_are_timed(binary: str) -> None:
    result = differential.compare("B3/S23", 3, STEPS, LATTICE, LATTICE, binary=binary)
    assert result.engine.step_nanos > 0
    assert result.reference_nanos > 0
    if LATTICE * STEPS >= 1_000:
        # The packed engine is the fast path; if this ever inverts, something is badly wrong.
        assert result.engine.step_nanos < result.reference_nanos
