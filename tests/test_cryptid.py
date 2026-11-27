"""The cryptid ladder's mirror, run as ``pytest -m differential``.

`crates/ca-cryptid` walks the same tape as `verifier.cryptid_trace` without the interpreter's
per-transition cost, which is what lets the matched-decade ladder in `docs/methods.md` be carried to
10^10. A mirror is only worth having if it agrees with what it mirrors, so every sample it reports
here is compared with the Python walk's own — the same numbers, not merely the same verdict.

Three comparisons, at three budgets:

* 10^6, live against the Python producer, in every differential run;
* 10^9, live against the samples the producer wrote into the product, so the mirror is held to the
  budget the page actually draws without paying twelve minutes of CPython per run;
* the BB(5) champion's published 47,176,870, where both implementations replay the whole run.

The champion's replay lives here rather than in the default suite because it costs about half a
minute of CPython while the mirror walks the same machine in under a second; comparing the two step
counts is a stronger check than either walk alone, and the differential job builds the mirror
anyway. The committed ladder's agreement with the product is checked in `tests/test_verifier.py`,
which needs no binary. None of this is a verdict: the longer run says the walk extends, not that
these machines were decided.

Needs ``cargo build -p ca-cryptid --release`` first, or ``CA_CRYPTID_BIN`` pointing at the binary.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from computation_atlas import cryptid_ladder, verifier

pytestmark = pytest.mark.differential

STEPS = 1_000_000
SAMPLES = (1_000, 10_000, 100_000, 1_000_000)

# The champion's replay is the one test here that spends real time in CPython (about half a minute);
# the default suite keeps only the product's recorded step count, in `tests/test_verifier.py`.
MANIFEST = Path("products/verifier/manifest.json")


@pytest.fixture(scope="module")
def binary() -> Path:
    try:
        return cryptid_ladder.find_binary()
    except FileNotFoundError as error:
        pytest.skip(str(error))


def run(binary: Path, machine: str, steps: int, samples=SAMPLES) -> dict:
    result = subprocess.run(
        [
            str(binary),
            "--machine",
            machine,
            "--steps",
            str(steps),
            "--samples",
            ",".join(str(sample) for sample in samples),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def recorded(path: Path, name: str) -> dict:
    """One machine's walk as an artefact records it, whichever artefact it is."""
    document = json.loads(path.read_text(encoding="utf-8"))
    for entry in document.get("cryptids", document.get("machines", [])):
        if entry["name"] == name:
            return entry.get("trace", entry)
    raise AssertionError(f"{name} is not in {path}")


@pytest.mark.parametrize("entry", verifier.CRYPTIDS, ids=lambda entry: entry["name"])
def test_the_mirror_reproduces_the_python_walk_sample_for_sample(binary: Path, entry: dict):
    trace = verifier.cryptid_trace(verifier.parse(entry["string"]), STEPS)
    mirror = run(binary, entry["string"], STEPS)
    assert mirror["halted"] is False
    assert mirror["steps"] == STEPS
    assert mirror["samples"] == trace["samples"], (
        "the mirror and the producer disagree; the ladder is only as good as this equality"
    )


@pytest.mark.parametrize("entry", verifier.CRYPTIDS, ids=lambda entry: entry["name"])
def test_the_mirror_reproduces_the_product_at_the_products_own_budget(binary: Path, entry: dict):
    """The gap between 10^6 and the product's budget, closed without pretending CPython is free.

    The product's samples at 10^9 are the Python producer's own, written by
    `python -m computation_atlas.verifier` and held to `CRYPTID_STEPS` by `tests/test_verifier.py`.
    Re-running them here would cost twelve minutes per test; comparing the mirror with what the
    producer actually wrote costs a second of Rust and tests the same equality.
    """
    trace = recorded(MANIFEST, entry["name"])
    assert trace["steps"] == verifier.CRYPTID_STEPS
    mirror = run(binary, entry["string"], verifier.CRYPTID_STEPS, verifier.CRYPTID_SAMPLES)
    assert mirror["halted"] is False
    assert mirror["samples"] == trace["samples"], (
        "the mirror disagrees with the product at the budget the page draws"
    )


def test_the_mirror_stops_a_halting_machine_where_the_python_walk_does(binary: Path):
    text = "1RB1LB_1LA1RH"
    trace = verifier.cryptid_trace(verifier.parse(text), verifier.CAP)
    mirror = run(binary, text, verifier.CAP)
    assert trace["halted"] is True
    assert mirror["halted"] is True
    assert mirror["steps"] == trace["steps"] == 6
    assert mirror["samples"] == trace["samples"] == []


def test_the_mirror_and_the_python_walk_agree_on_the_champions_halting_step(binary: Path):
    """The published S(5) champion, replayed by both implementations at the full budget.

    The step count is the one number in this module that is quoted from a proof rather than
    measured, so it is measured here twice: the mirror walks the whole run, the producer walks it
    too, and the two stop at the same transition. Before the halt, the samples agree as well.
    """
    text = verifier.CHAMPION
    mirror = run(binary, text, verifier.CHAMPION_STEPS + 1, SAMPLES)
    assert mirror["halted"] is True
    assert mirror["steps"] == verifier.CHAMPION_STEPS
    assert verifier.steps_to_halt(verifier.parse(text), verifier.CHAMPION_STEPS + 1) == (
        verifier.CHAMPION_STEPS
    )
    trace = verifier.cryptid_trace(verifier.parse(text), STEPS)
    assert trace["halted"] is False
    assert mirror["samples"] == trace["samples"], "the two walks differ before the halt"


def test_the_mirror_agrees_on_a_machine_that_never_leaves_its_window(binary: Path):
    """The span and drift are the whole report, so they are compared where they are smallest too."""
    text = "1RB0RB_1RB0RB"
    mirror = run(binary, text, verifier.CAP, (verifier.CAP,))
    trace = verifier.cryptid_trace(verifier.parse(text), verifier.CAP)
    assert mirror["samples"] == trace["samples"]
    assert mirror["halted"] is False
