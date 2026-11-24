import json
from pathlib import Path

import pytest

from computation_atlas import checker, verifier

MANIFEST = Path("products/verifier/manifest.json")


def test_a_machine_string_round_trips_and_a_halt_is_canonical():
    machine = verifier.parse("1RB1LB_1LA1RH")
    assert machine.string() == "1RB1LB_1LA---"
    assert verifier.parse(machine.string()).string() == machine.string()
    champion = verifier.parse(verifier.CHAMPION)
    assert champion.string() == verifier.CHAMPION


@pytest.mark.parametrize(
    "text",
    [
        "1RB1LB_1LA",  # a five-character block
        "2RB1LB_1LA1LA",  # a symbol that is not 0 or 1
        "1XB1LB_1LA1LA",  # a direction that is not L or R
        "1RC1LB_1LA1LA",  # a target state the machine does not have
        # Eight blocks: the cryptid exhibits reach seven states, and no machine has more.
        "1RB1LB_1LA1LA_1LA1LA_1LA1LA_1LA1LA_1LA1LA_1LA1LA_1LA1LA",
    ],
)
def test_bad_machine_strings_are_refused(text):
    with pytest.raises(verifier.MachineError):
        verifier.parse(text)


def test_the_halting_transition_is_counted():
    """S(2)=6 is five moves and the sixth transition that stops the machine."""
    assert verifier.steps_to_halt(verifier.parse("1RB1LB_1LA1RH"), 64) == 6
    steps, halted, _, _, _ = verifier.simulate(verifier.parse("1RB1LB_1LA1RH"), 64)
    assert halted and steps == 6


def test_the_checker_accepts_a_true_halting_certificate_and_refuses_a_wrong_one():
    text = "1RB1LB_1LA1RH"
    assert checker.check(text, {"kind": "halts", "steps": 6})[0]
    accepted, reason = checker.check(text, {"kind": "halts", "steps": 7})
    assert not accepted and "halts at step 6" in reason


def test_the_checker_refuses_a_repeat_that_never_happens():
    text = "1RB1LB_1LA1RH"
    accepted, reason = checker.check(text, {"kind": "cycle", "start": 2, "period": 2})
    assert not accepted
    assert "halts" in reason or "does not repeat" in reason


def test_the_search_reproduces_s2():
    run = verifier.search(2)
    assert run["reproduced"] == 6
    assert run["quoted"] == 6
    # The define-on-visit enumeration of two-state machines: each one is visited once.
    assert run["machines"] == 166
    assert run["halting"] > 0 and run["certified"] > 0
    assert run["examples"]["cycler"]["certificate"]["kind"] == "cycle"
    assert run["bouncer"] > 0, "no confined cycle was found, so the bouncer count is untested"


def test_the_champion_halts_after_the_quoted_step_count():
    steps = verifier.steps_to_halt(verifier.parse(verifier.CHAMPION), verifier.CHAMPION_STEPS + 1)
    assert steps == verifier.CHAMPION_STEPS


@pytest.fixture(scope="module")
def document():
    assert MANIFEST.exists(), "products/verifier/manifest.json is missing; run the module"
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def test_the_manifest_reproduces_the_small_values(document):
    runs = {run["states"]: run for run in document["runs"]}
    assert runs[2]["reproduced"] == 6
    assert runs[3]["reproduced"] == 21
    assert runs[4]["reproduced"] == 107
    for run in runs.values():
        assert run["quoted"] == run["reproduced"]
        # Nothing is lost: every machine is in exactly one class.
        decided = run["halting"] + run["certified"] + run["heuristic"] + run["undecided"]
        assert decided == run["machines"]


def test_the_manifest_records_the_champion_as_quoted_and_rerun(document):
    champion = document["champion"]
    assert champion["steps"] == champion["quoted"] == 47_176_870
    assert champion["halted"] is True
    assert "arXiv" in champion["source"]
    assert document["seed"] == verifier.LABEL_SEED


def test_the_cryptids_are_quoted_verbatim_and_left_undecided(document):
    """A cryptid is quoted, not classified: 256 steps may not produce a certificate for one."""
    cryptids = document["cryptids"]
    assert len(cryptids) == len(verifier.CRYPTIDS)
    assert {"Bigfoot", "Antihydra", "Space Needle"} <= {entry["name"] for entry in cryptids}
    for entry in cryptids:
        machine = verifier.parse(entry["string"])
        assert machine.string() == entry["string"], (
            "the string does not round-trip through the parser"
        )
        assert machine.states == entry["states"]
        assert machine.states >= 6, "a cryptid exhibit is a six- or seven-state machine"
        assert entry["source"].startswith("https://wiki.bbchallenge.org")
        assert entry["claim"], "the wiki's own words are recorded beside the machine"
        # Nothing on the page may read as a verdict about the open problem.
        assert entry["verdict"] != "certified"
        assert entry["certificate"] is None
        assert entry["checker"] is None


def test_every_labelled_certificate_is_accepted_and_every_mutation_refused(document):
    assert document["labelled"], "the labelled set is empty"
    kinds = set()
    for entry in document["labelled"]:
        if entry["certificate"] is None:
            assert entry["verdict"] in {"heuristic", "undecided"}
            assert entry["mutations"] == []
            continue
        assert entry["checker"] == "accepted", entry["string"]
        assert checker.check(entry["string"], entry["certificate"])[0]
        kinds.add(entry["certificate"]["kind"])
        assert entry["mutations"], f"no mutations recorded for {entry['string']}"
        for mutation in entry["mutations"]:
            assert mutation["accepted"] is False, (entry["string"], mutation["label"])
            assert mutation["reason"], mutation["label"]
    assert kinds == {"halts", "cycle", "translation"}


def test_a_heuristic_verdict_is_never_recorded_as_certified(document):
    for entry in document["labelled"]:
        if entry["verdict"] == "heuristic":
            assert entry["certificate"] is None
            assert entry["checker"] is None
