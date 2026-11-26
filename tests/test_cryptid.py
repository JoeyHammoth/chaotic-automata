"""The cryptid ladder's mirror, run as ``pytest -m differential``.

`crates/ca-cryptid` walks the same tape as `verifier.cryptid_trace` without the interpreter's
per-transition cost, which is what lets the matched-decade ladder in `docs/methods.md` be carried to
10^10. A mirror is only worth having if it agrees with what it mirrors, so every sample it reports
here is compared with the Python walk's own — the same numbers, not merely the same verdict.

The budget is 10^6, the first four rungs of the product's ladder, because this test pays the Python
producer's speed and not the tool's. The 10^9 agreement the ladder was taken after was checked by
hand once; the range CI can afford is the part that keeps it true as both sides change.

Needs ``cargo build -p ca-cryptid --release`` first, or ``CA_CRYPTID_BIN`` pointing at the binary.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest

from computation_atlas import verifier

pytestmark = pytest.mark.differential

STEPS = 1_000_000
SAMPLES = (1_000, 10_000, 100_000, 1_000_000)


def find_binary() -> Path:
    override = os.environ.get("CA_CRYPTID_BIN")
    if override:
        return Path(override)
    for profile in ("release", "debug"):
        for name in ("ca-cryptid.exe", "ca-cryptid"):
            candidate = Path("target") / profile / name
            if candidate.exists():
                return candidate
    raise FileNotFoundError("cargo build -p ca-cryptid --release")


@pytest.fixture(scope="module")
def binary() -> Path:
    try:
        return find_binary()
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


@pytest.mark.parametrize("entry", verifier.CRYPTIDS, ids=lambda entry: entry["name"])
def test_the_mirror_reproduces_the_python_walk_sample_for_sample(binary: Path, entry: dict):
    trace = verifier.cryptid_trace(verifier.parse(entry["string"]), STEPS)
    mirror = run(binary, entry["string"], STEPS)
    assert mirror["halted"] is False
    assert mirror["steps"] == STEPS
    assert mirror["samples"] == trace["samples"], (
        "the mirror and the producer disagree; the ladder is only as good as this equality"
    )


def test_the_mirror_stops_a_halting_machine_where_the_python_walk_does(binary: Path):
    text = "1RB1LB_1LA1RH"
    trace = verifier.cryptid_trace(verifier.parse(text), verifier.CAP)
    mirror = run(binary, text, verifier.CAP)
    assert trace["halted"] is True
    assert mirror["halted"] is True
    assert mirror["steps"] == trace["steps"] == 6
    assert mirror["samples"] == trace["samples"] == []


def test_the_mirror_agrees_on_a_machine_that_never_leaves_its_window(binary: Path):
    """The span and drift are the whole report, so they are compared where they are smallest too."""
    text = "1RB0RB_1RB0RB"
    mirror = run(binary, text, verifier.CAP, (verifier.CAP,))
    trace = verifier.cryptid_trace(verifier.parse(text), verifier.CAP)
    assert mirror["samples"] == trace["samples"]
    assert mirror["halted"] is False
