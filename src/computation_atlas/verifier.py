"""The Verifier (M5b): machines, untrusted deciders, and the exhaustive search behind them.

Nothing here is trusted. A decider guesses "this machine never halts" and hands over a certificate;
`computation_atlas.checker.check` replays the machine from the start and either accepts the
certificate or refuses it. A machine that reaches the cap with no accepted certificate is either
``heuristic`` (it stayed inside a small region, which looks periodic but is not proved) or
``undecided`` (it wandered off and nothing is known). Neither is ever counted as non-halting.

Three deciders, one claim each:

``cycler``           the whole configuration repeats, head included.
``bouncer``          the same claim, for a machine whose head never leaves a window of <= 32 cells:
                     a bouncer is a confined cycler, and is reported separately because that is what
                     it looks like on the tape.
``translated cycler`` the configuration repeats up to a translation.

S(5) = 47,176,870 is quoted from the bbchallenge proof (arXiv:2509.12337), not re-proved here. The
champion's step count is re-run, because a step count is something this pipeline can check.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from computation_atlas.checker import check

HALT = -1
CAP = 256
CHECK_EVERY = 32
LABEL_SEED = 97
HEURISTIC_SPAN = 64
BOUNCER_SPAN = 8
LETTERS = "ABCDEFG"

CHAMPION = "1RB1LC_1RC1RB_1RD0LE_1LA1LD_---0LA"
CHAMPION_STEPS = 47_176_870
CHAMPION_SOURCE = (
    "bbchallenge Collaboration, Determination of the fifth Busy Beaver value, arXiv:2509.12337"
)

QUOTED = {2: 6, 3: 21, 4: 107, 5: CHAMPION_STEPS}

CRYPTID_SOURCE = "https://wiki.bbchallenge.org/wiki/Cryptids"

# A 256-step cap says nothing about a cryptid, so the exhibit also runs each one for a million
# transitions on the array tape and records how far it got. That is still not a verdict — it is the
# shape of the walk, which is the thing a reader can actually see.
CRYPTID_STEPS = 1_000_000
CRYPTID_SAMPLES = (1_000, 10_000, 100_000, 1_000_000)

# Machines whose halting problem is tied to an open problem, quoted from the bbchallenge wiki. They
# are exhibits, not a search: the 256-step cap says nothing about any of them, and the page says so.
CRYPTIDS = [
    {
        "name": "Bigfoot",
        "string": "0RB1RB_1LC0RA_1RE1LF_1LF1RE_0RD1RD_1LG0LG_---1LB",
        "domain": "BB(7)",
        "claim": "probviously non-halting",
        "found": "Nov 2023, Shawn Ligocki",
        "note": "The BB(7) machine is compiled by @Iijil1 (June 2024).",
    },
    {
        "name": "Antihydra",
        "string": "1RB1RA_0LC1LE_1LD1LC_1LA0LB_1LF1RE_---0RA",
        "domain": "BB(6)",
        "claim": "probviously non-halting",
        "found": "Jun 2024, mxdys; shown to be a cryptid by Racheline",
        "note": "Hydra's mirror image: same rule, starting from 8 instead of 3, with the opposite "
        "termination condition.",
    },
    {
        "name": "Lucy's Moonlight",
        "string": "1RB0RD_0RC1RE_1RD0LA_1LE1LC_1RF0LD_---0RA",
        "domain": "BB(6)",
        "claim": "probviously halting",
        "found": "Mar 2025, Racheline",
        "note": "A cryptid whose behaviour is expected to end in a halt rather than in a cycle.",
    },
    {
        "name": "Space Needle",
        "string": "1RB1LA_1LC0RE_1LF1LD_0RB0LA_1RC1RE_---0LD",
        "domain": "BB(6)",
        "claim": "probviously non-halting",
        "found": "Jan 2025, mxdys",
        "note": "Has near-identical behaviour to a cluster of related BB(6) holdouts.",
    },
]


class MachineError(ValueError):
    """A machine string that is not a 2-symbol machine of 1..7 states."""


@dataclass(frozen=True)
class Machine:
    states: int
    write: tuple[int, ...]
    move: tuple[int, ...]
    nxt: tuple[int, ...]

    def string(self) -> str:
        """The bbchallenge string: one block per state, three characters per transition.

        A halting transition is written ``---``. ``1RH`` and ``---`` are the same machine, and this
        is the canonical spelling of both.
        """
        blocks = []
        for state in range(self.states):
            parts = []
            for sym in (0, 1):
                i = 2 * state + sym
                if self.write[i] == HALT or self.nxt[i] == HALT:
                    parts.append("---")
                else:
                    direction = "R" if self.move[i] > 0 else "L"
                    parts.append(f"{self.write[i]}{direction}{LETTERS[self.nxt[i]]}")
            blocks.append("".join(parts))
        return "_".join(blocks)


def parse(text: str) -> Machine:
    """Read a bbchallenge machine string; ``---`` and ``H`` both mean the machine halts there."""
    blocks = text.strip().replace(" ", "").split("_")
    if not 1 <= len(blocks) <= len(LETTERS):
        raise MachineError(f"expected 1 to {len(LETTERS)} state blocks, found {len(blocks)}")
    states = len(blocks)
    write: list[int] = []
    move: list[int] = []
    nxt: list[int] = []
    for block in blocks:
        if len(block) != 6:
            raise MachineError(f"block {block!r} is not two 3-character transitions")
        for k in (0, 1):
            chunk = block[3 * k : 3 * k + 3]
            if chunk == "---" or chunk.endswith("H"):
                # A halting transition: the write and the move never happen, so they are dropped
                # rather than carried as a live transition to a state that does not exist.
                write.append(HALT)
                move.append(0)
                nxt.append(HALT)
                continue
            symbol, direction, target = chunk[0], chunk[1], chunk[2]
            if symbol not in "01":
                raise MachineError(f"{chunk!r} writes {symbol!r}, which is not 0 or 1")
            if direction not in "LR":
                raise MachineError(f"{chunk!r} moves {direction!r}, which is not L or R")
            if target not in LETTERS[:states]:
                raise MachineError(f"{chunk!r} targets state {target!r}, outside this machine")
            write.append(int(symbol))
            move.append(1 if direction == "R" else -1)
            nxt.append(LETTERS.index(target))
    return Machine(states, tuple(write), tuple(move), tuple(nxt))


def simulate(machine: Machine, cap: int) -> tuple[int, bool, dict[int, int], int, int]:
    """Step until halt or `cap`. The tape is sparse, so only written cells cost anything."""
    write, move, nxt = machine.write, machine.move, machine.nxt
    tape: dict[int, int] = {}
    head = 0
    state = 0
    for step in range(cap):
        i = 2 * state + tape.get(head, 0)
        if write[i] == HALT or nxt[i] == HALT:
            # The halting transition counts: S(2)=6 is five moves and the sixth that stops it.
            return step + 1, True, tape, head, state
        tape[head] = write[i]
        head += move[i]
        state = nxt[i]
    return cap, False, tape, head, state


def _grow(tape: bytearray, head: int, low: int, high: int) -> tuple[bytearray, int, int, int]:
    size = len(tape)
    grown = bytearray(size * 2)
    offset = size // 2
    grown[offset : offset + size] = tape
    return grown, head + offset, low + offset, high + offset


def steps_to_halt(machine: Machine, cap: int) -> int | None:
    """The same walk as `simulate`, on an array tape: the champion needs 47 million of these."""
    write, move, nxt = machine.write, machine.move, machine.nxt
    tape = bytearray(1 << 12)
    head = 1 << 11
    state = 0
    for step in range(cap):
        i = state + state + tape[head]
        if write[i] == HALT or nxt[i] == HALT:
            return step + 1
        tape[head] = write[i]
        head += move[i]
        state = nxt[i]
        if head < 16 or head >= len(tape) - 16:
            tape, head, _, _ = _grow(tape, head, head, head)
    return None


def decide(machine: Machine, cap: int = CAP) -> tuple[str, dict | None, int]:
    """Run the deciders over one machine: ``(verdict, certificate, steps)``.

    The verdict is ``halts``, ``certified``, ``heuristic`` or ``undecided``. A certified verdict is
    a guess until `checker.check` accepts its certificate; a heuristic one has no certificate and
    is never promoted to one.
    """
    write, move, nxt = machine.write, machine.move, machine.nxt
    tape = bytearray(1 << 10)
    head = 1 << 9
    state = 0
    low = high = head
    ones = 0
    seen: dict[tuple, tuple[int, int]] = {}
    drifting: dict[tuple, tuple[int, int]] = {}
    attempts = 0
    for step in range(cap):
        i = state + state + tape[head]
        if write[i] == HALT or nxt[i] == HALT:
            return "halts", {"kind": "halts", "steps": step + 1}, step + 1
        ones += write[i] - tape[head]
        tape[head] = write[i]
        if head < low:
            low = head
        elif head > high:
            high = head
        head += move[i]
        state = nxt[i]
        if head < 16 or head >= len(tape) - 16:
            tape, head, low, high = _grow(tape, head, low, high)

        if step >= CHECK_EVERY and step % CHECK_EVERY == 0:
            # The configuration belongs to step+1 transitions, not step: the transition above has
            # already happened. Recording the wrong count makes the checker compare two different
            # moments, which is exactly how it caught this the first time.
            at = step + 1
            # The key is the whole written span, sliced at C speed, translated so its left edge is
            # 0. A window around the head would repeat on almost every machine and prove nothing.
            key = (state, head - low, bytes(tape[low : high + 1]))
            previous = seen.get(key)
            if previous is not None:
                start, previous_head = previous
                shift = head - previous_head
                period = at - start
                span = high - low
                if shift == 0:
                    period = _cycle_period(machine, start, period)
                    # The bouncer is the same claim for a head trapped between two walls, so it is
                    # counted as the confined subset of the cycler rather than as a fourth verdict.
                    return (
                        "certified",
                        {
                            "kind": "cycle",
                            "decider": "cycler",
                            "confined": span <= BOUNCER_SPAN,
                            "start": start,
                            "period": period,
                            "span": span,
                        },
                        at,
                    )
                return (
                    "certified",
                    {
                        "kind": "translation",
                        "decider": "translated cycler",
                        "start": start,
                        "period": period,
                        "shift": shift,
                        "span": span,
                    },
                    at,
                )
            seen[key] = (at, head)

            # A marching machine's written span only grows, so the exact key above can never repeat
            # for it. This second key drops the span and keeps the head's neighbourhood and the
            # number of live cells, which is translation-invariant; a hit is then confirmed against
            # the whole tape before anything is certified.
            near = bytes(tape[head - 8 : head + 9])
            dkey = (state, near, ones)
            previous = drifting.get(dkey)
            if previous is None:
                drifting[dkey] = (at, head)
            elif attempts < 3:
                start, previous_head = previous
                shift = head - previous_head
                if shift != 0:
                    attempts += 1
                    before = simulate(machine, start)
                    after = simulate(machine, at)
                    if (
                        not before[1]
                        and not after[1]
                        and before[4] == after[4]
                        and _shifted(before[2], shift) == _trim(after[2])
                    ):
                        return (
                            "certified",
                            {
                                "kind": "translation",
                                "decider": "translated cycler",
                                "start": start,
                                "period": at - start,
                                "shift": shift,
                                "span": high - low,
                            },
                            at,
                        )

    if high - low <= HEURISTIC_SPAN:
        return "heuristic", None, cap
    return "undecided", None, cap


def _divisors(number: int) -> list[int]:
    """Every divisor of `number` below it, ascending. Only a divisor can be a smaller period."""
    out: list[int] = []
    for candidate in range(1, int(number**0.5) + 1):
        if number % candidate == 0:
            out.append(candidate)
            if candidate != number // candidate and candidate != 1:
                out.append(number // candidate)
    return sorted(divisor for divisor in set(out) if divisor < number)


def _cycle_period(machine: Machine, start: int, period: int) -> int:
    """The smallest period of the cycle that begins at `start`.

    The checker requires the named period to be the smallest one, so a certificate that named a
    multiple would be refused — and rightly: the smaller period is the real claim. A repeat can
    only recur at a divisor of the detected gap.
    """
    before = simulate(machine, start)
    if before[1]:
        return period
    for divisor in _divisors(period):
        after = simulate(machine, start + divisor)
        if (
            not after[1]
            and before[3] == after[3]
            and before[4] == after[4]
            and _trim(before[2]) == _trim(after[2])
        ):
            return divisor
    return period


def _trim(tape: dict[int, int]) -> dict[int, int]:
    return {position: symbol for position, symbol in tape.items() if symbol}


def _shifted(tape: dict[int, int], shift: int) -> dict[int, int]:
    return {position + shift: symbol for position, symbol in tape.items() if symbol}


def mutations(certificate: dict) -> list[dict]:
    """The same certificate with one thing changed: what the checker must refuse.

    Each decider gets mutations aimed at its own claim, so none passes because the mutation happened
    to be harmless.
    """
    kind = certificate["kind"]
    out: list[dict] = []

    def add(label: str, **changes: object) -> None:
        mutated = dict(certificate)
        mutated.update(changes)
        out.append({"label": label, "certificate": mutated})

    if kind == "halts":
        add("one step too many", steps=certificate["steps"] + 1)
        add("one step too few", steps=certificate["steps"] - 1)
    elif kind == "cycle":
        # A true cycle is true from any phase, so shifting the start is not a falsifier. A period
        # longer than the smallest one is: the checker requires the period to be minimal.
        add("period off by one", period=certificate["period"] + 1)
        add("kind relabelled as a translation", kind="translation")
    elif kind == "translation":
        add("shift off by one", shift=certificate["shift"] + 1)
        add("period off by one", period=certificate["period"] + 1)
    return out


def tnf_machines(states: int):
    """Every machine in tree normal form, once.

    Any halting machine has a representative here: renaming states, swapping the two symbols and
    mirroring the tape are all symmetries of the halting time, so the first transition can be fixed
    to ``1RB`` and every new state can be introduced in order.
    """
    if states == 1:
        yield Machine(1, (HALT, HALT), (0, 0), (HALT, HALT))
        return
    slots = 2 * states
    table: list[tuple[int, int, int] | None] = [None] * slots
    table[0] = (1, 1, 1)

    def machine() -> Machine:
        # Slots the run never reached are halts: they are unreachable, so they cannot change it.
        filled = [entry if entry is not None else (HALT, 0, HALT) for entry in table]
        return Machine(
            states,
            tuple(entry[0] for entry in filled),
            tuple(entry[1] for entry in filled),
            tuple(entry[2] for entry in filled),
        )

    def walk(used: int):
        # Tree normal form defines a transition only when the run first needs it, so the branch is
        # on the slot the head actually reads next. This is what keeps the space at millions
        # instead of the hundreds of millions a slot-by-slot product would enumerate.
        tape: dict[int, int] = {}
        head = 0
        state = 0
        for _ in range(CAP):
            slot = 2 * state + tape.get(head, 0)
            entry = table[slot]
            if entry is None:
                targets = [HALT, *range(used)]
                if used < states:
                    targets.append(used)
                for symbol in (0, 1):
                    for direction in (1, -1):
                        for target in targets:
                            table[slot] = (
                                (HALT, 0, HALT) if target == HALT else (symbol, direction, target)
                            )
                            grown = used if target == HALT else max(used, target + 1)
                            yield from walk(grown)
                table[slot] = None
                return
            if entry[0] == HALT:
                yield machine()
                return
            tape[head] = entry[0]
            head += entry[1]
            state = entry[2]
        # The cap was reached with every reachable transition already defined: complete machine.
        yield machine()

    yield from walk(2)


def search(states: int, cap: int = CAP) -> dict:
    """Exhaustive search over the tree-normal-form machines of `states` states."""
    machines = halting = certified = heuristic = undecided = 0
    deciders = {"cycler": 0, "translated cycler": 0}
    confined = 0
    best_steps = 0
    best = ""
    examples: dict[str, dict] = {}
    for machine in tnf_machines(states):
        machines += 1
        verdict, certificate, steps = decide(machine, cap)
        text = machine.string()
        if verdict == "halts":
            halting += 1
            if steps > best_steps:
                best_steps, best = steps, text
        elif verdict == "certified":
            certified += 1
            assert certificate is not None
            deciders[certificate["decider"]] += 1
            if certificate.get("confined"):
                confined += 1
            accepted, reason = check(text, certificate)
            if not accepted:
                raise RuntimeError(f"the checker refused a certificate for {text}: {reason}")
        elif verdict == "heuristic":
            heuristic += 1
        else:
            undecided += 1
        key = certificate.get("decider", certificate["kind"]) if certificate else verdict
        if key not in examples:
            examples[key] = {"string": text, "steps": steps, "certificate": certificate}
        if machines % 100_000 == 0:
            print(f"  {states} states: {machines} machines so far", flush=True)
    return {
        "states": states,
        "quoted": QUOTED.get(states),
        "reproduced": best_steps or None,
        "champion": best or None,
        "machines": machines,
        "halting": halting,
        "certified": certified,
        "cycler": deciders["cycler"],
        "bouncer": confined,
        "translated": deciders["translated cycler"],
        "heuristic": heuristic,
        "undecided": undecided,
        "examples": examples,
    }


CLAIMS = [
    {
        "text": "S(2)=6, S(3)=21, S(4)=107 reproduce by exhaustive search",
        "source": "this pipeline: every tree-normal-form machine up to four states",
        "verified": True,
    },
    {
        "text": "S(5)=47,176,870 is quoted from the proof, not re-proved here",
        "source": CHAMPION_SOURCE,
        "verified": True,
    },
    {
        "text": "a certified verdict is a replay the checker accepted; a heuristic one is a guess",
        "source": "docs/methods.md M5b",
        "verified": True,
    },
    {
        "text": (
            "the six- and seven-state cryptids below carry no verdict here: a 256-step cap says "
            "nothing about a machine whose halting is an open problem"
        ),
        "source": CRYPTID_SOURCE,
        "verified": True,
    },
]


def cryptid_trace(machine: Machine, steps: int = CRYPTID_STEPS) -> dict:
    """Walk a machine for `steps` transitions on an array tape and sample how far it has spread.

    The dict tape the deciders use is too slow for a million steps and too heavy for a machine that
    wanders; this is the same walk as `steps_to_halt` with the span recorded at the sample points.
    """
    write, move, nxt = machine.write, machine.move, machine.nxt
    tape = bytearray(1 << 12)
    head = 1 << 11
    state = 0
    low = high = head
    wanted = sorted(set(CRYPTID_SAMPLES) | {steps})
    samples: list[dict] = []
    index = 0
    for step in range(steps):
        i = state + state + tape[head]
        if write[i] == HALT or nxt[i] == HALT:
            return {"halted": True, "steps": step + 1, "samples": samples}
        tape[head] = write[i]
        if head < low:
            low = head
        elif head > high:
            high = head
        head += move[i]
        state = nxt[i]
        if head < 16 or head >= len(tape) - 16:
            tape, head, low, high = _grow(tape, head, low, high)
        done = step + 1
        while index < len(wanted) and done == wanted[index]:
            samples.append({"steps": done, "span": high - low, "drift": head - low})
            index += 1
    return {"halted": False, "steps": steps, "samples": samples}


def cryptid_exhibits() -> list[dict]:
    """What this pipeline says about the quoted cryptids, which is nothing about their halting."""
    out: list[dict] = []
    for entry in CRYPTIDS:
        machine = parse(entry["string"])
        verdict, certificate, steps = decide(machine, CAP)
        _, halted, tape, _, _ = simulate(machine, CAP)
        span = (max(tape) - min(tape)) if tape else 0
        accepted = None
        reason = None
        if certificate is not None:
            accepted, reason = check(entry["string"], certificate)
        out.append(
            {
                **entry,
                "states": machine.states,
                "verdict": verdict,
                "steps": steps,
                "halted": halted,
                "span": span,
                "certificate": certificate,
                "checker": "accepted" if accepted else ("refused" if accepted is False else None),
                "reason": reason,
                "trace": cryptid_trace(machine),
                "source": CRYPTID_SOURCE,
            }
        )
    return out


def build_document() -> dict:
    runs = [search(states) for states in (2, 3, 4)]
    champion_steps = steps_to_halt(parse(CHAMPION), CHAMPION_STEPS + 1)
    labelled = []
    for run in runs:
        for verdict, example in run["examples"].items():
            accepted = None
            reason = None
            if example["certificate"] is not None:
                accepted, reason = check(example["string"], example["certificate"])
            refused = []
            if example["certificate"] is not None:
                for mutation in mutations(example["certificate"]):
                    ok, why = check(example["string"], mutation["certificate"])
                    refused.append(
                        {
                            "label": mutation["label"],
                            "certificate": mutation["certificate"],
                            "accepted": ok,
                            "reason": why,
                        }
                    )
            labelled.append(
                {
                    "string": example["string"],
                    "states": run["states"],
                    "verdict": verdict,
                    "steps": example["steps"],
                    "certificate": example["certificate"],
                    "checker": (
                        "accepted" if accepted else ("refused" if accepted is False else None)
                    ),
                    "reason": reason,
                    "mutations": refused,
                }
            )
    return {
        "version": 1,
        "generated_by": "computation_atlas.verifier",
        "seed": LABEL_SEED,
        "cap": CAP,
        "check_every": CHECK_EVERY,
        "heuristic_span": HEURISTIC_SPAN,
        "bouncer_span": BOUNCER_SPAN,
        "machine_format": (
            "bbchallenge: one block per state, 3 characters per transition, --- halts"
        ),
        "runs": runs,
        "champion": {
            "string": CHAMPION,
            "steps": champion_steps,
            "quoted": CHAMPION_STEPS,
            "halted": champion_steps is not None,
            "source": CHAMPION_SOURCE,
        },
        "labelled": labelled,
        "cryptids": cryptid_exhibits(),
        "claims": CLAIMS,
    }


def main() -> None:
    target = Path("products/verifier")
    target.mkdir(parents=True, exist_ok=True)
    document = build_document()
    text = json.dumps(document, indent=2, sort_keys=False) + "\n"
    (target / "manifest.json").write_text(text, encoding="utf-8")
    for run in document["runs"]:
        print(
            f"S({run['states']}) quoted {run['quoted']} reproduced {run['reproduced']} "
            f"over {run['machines']} machines: {run['halting']} halt, "
            f"{run['certified']} certified, {run['heuristic']} heuristic, "
            f"{run['undecided']} undecided"
        )
    print(f"champion halts after {document['champion']['steps']} steps")
    print(f"wrote {target / 'manifest.json'} ({len(text)} bytes)")


if __name__ == "__main__":
    main()
