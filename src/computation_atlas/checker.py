"""The checker: a second, deliberately separate implementation that only replays.

This module shares no code with `computation_atlas.verifier` — it has its own parser and its own
stepper — so a bug in a decider cannot hide in the thing that is supposed to catch it. It is a
second implementation, not a proof: it says "this certificate replays", and the method page says
exactly that.

A certificate is a claim about the machine's future:

``halts``        the machine halts after `steps` steps, counting the halting transition.
``cycle``        after `start` steps the configuration repeats exactly every `period` steps,
                 and `period` is the smallest such number.
``translation``  the same, up to a tape translation of `shift` cells.

Every one is checked by replaying the machine from the start; none is taken on trust. A ``bouncer``
verdict is a cycle certificate with a small span, and is checked as the cycle it is.
"""

from __future__ import annotations

HALT = -1


class CheckError(ValueError):
    """A machine string or certificate the checker cannot even read."""


def _read(text: str) -> tuple[int, list[int], list[int], list[int]]:
    blocks = text.strip().split("_")
    if not 1 <= len(blocks) <= 7:
        raise CheckError(f"a machine has 1 to 7 blocks, not {len(blocks)}")
    states = len(blocks)
    writes = [HALT] * (2 * states)
    moves = [0] * (2 * states)
    targets = [HALT] * (2 * states)
    for index, block in enumerate(blocks):
        if len(block) != 6:
            raise CheckError(f"block {block!r} is not six characters")
        for half in (0, 1):
            cell = block[3 * half : 3 * half + 3]
            slot = 2 * index + half
            if cell == "---":
                continue
            writes[slot] = int(cell[0])
            moves[slot] = -1 if cell[1] == "L" else 1
            if cell[2] == "H":
                targets[slot] = HALT
            else:
                targets[slot] = "ABCDEFG".index(cell[2])
    return states, writes, moves, targets


def _snapshot(
    writes: list[int],
    moves: list[int],
    targets: list[int],
    upto: int,
    stop_at_halt: bool = True,
) -> tuple[dict[int, int], int, int, int] | None:
    """Replay `upto` steps from the empty tape.

    Returns the tape, head, state and the step the machine halted at (-1 if it did not). A machine
    that halts early cannot repeat, so the caller refuses.
    """
    tape: dict[int, int] = {}
    head = 0
    state = 0
    halted_at = -1
    for step in range(upto):
        slot = 2 * state + tape.get(head, 0)
        if writes[slot] == HALT or targets[slot] == HALT:
            # The halting transition counts as a step, which is the convention S(n) uses.
            halted_at = step + 1
            if stop_at_halt:
                return None
            break
        tape[head] = writes[slot]
        head += moves[slot]
        state = targets[slot]
    return tape, head, state, halted_at


def _trim(tape: dict[int, int], shift: int = 0) -> dict[int, int]:
    return {position + shift: symbol for position, symbol in tape.items() if symbol}


def _smaller_periods(period: int) -> list[int]:
    """The divisors of `period` below it: the only numbers that could be a smaller period."""
    out = []
    for candidate in range(1, int(period**0.5) + 1):
        if period % candidate == 0:
            out.append(candidate)
            if candidate != period // candidate:
                out.append(period // candidate)
    return sorted(value for value in set(out) if value < period)


def _repeats(
    writes: list[int],
    moves: list[int],
    targets: list[int],
    start: int,
    steps: int,
    shift: int,
) -> bool | None:
    """Whether `start + steps` is the configuration at `start`, up to a tape translation."""
    before = _snapshot(writes, moves, targets, start)
    after = _snapshot(writes, moves, targets, start + steps)
    if before is None or after is None:
        return None
    tape_a, head_a, state_a, _ = before
    tape_b, head_b, state_b, _ = after
    if state_a != state_b or head_b - head_a != shift:
        return False
    return _trim(tape_a, shift) == _trim(tape_b)


def check(machine: str, certificate: dict) -> tuple[bool, str]:
    """Accept or refuse a certificate. The reason is meant to be shown to a reader."""
    if not isinstance(certificate, dict) or "kind" not in certificate:
        return False, "the certificate has no kind"
    kind = certificate["kind"]
    _, writes, moves, targets = _read(machine)

    if kind == "halts":
        steps = certificate.get("steps")
        if not isinstance(steps, int) or steps < 0:
            return False, "a halting certificate needs a step count"
        walked = _snapshot(writes, moves, targets, steps, stop_at_halt=False)
        assert walked is not None
        _, _, _, halted_at = walked
        if halted_at != steps:
            return False, f"the machine halts at step {halted_at}, not {steps}"
        return True, f"replayed {steps} steps and the machine halted there"

    start = certificate.get("start")
    period = certificate.get("period")
    if not isinstance(start, int) or not isinstance(period, int) or start < 0 or period <= 0:
        return False, "a non-halting certificate needs a start step and a positive period"

    before = _snapshot(writes, moves, targets, start)
    after = _snapshot(writes, moves, targets, start + period)
    if before is None or after is None:
        return False, "the machine halts before the claimed repeat, so it cannot repeat"

    tape_a, head_a, state_a, _ = before
    tape_b, head_b, state_b, _ = after
    if state_a != state_b:
        return False, f"the state differs: {state_a} then {state_b}"

    if kind == "cycle":
        if head_a != head_b or _trim(tape_a) != _trim(tape_b):
            return False, "the configuration does not repeat exactly"
        # The period a cycle is named by is its smallest one, so a longer true period is still a
        # false certificate: without this, any multiple of the period would replay. A repeat can
        # only recur at a divisor of the named period, so only those are tried.
        for smaller in _smaller_periods(period):
            if _repeats(writes, moves, targets, start, smaller, 0):
                return False, f"the configuration repeats every {smaller} steps, not {period}"
        return True, f"steps {start} and {start + period} are the same configuration"

    if kind == "translation":
        shift = certificate.get("shift")
        if not isinstance(shift, int):
            return False, "a translation certificate needs a shift"
        if head_b - head_a != shift:
            return False, f"the head moved {head_b - head_a}, not {shift}"
        if _trim(tape_a, shift) != _trim(tape_b):
            return False, f"the tape does not repeat up to a shift of {shift}"
        return True, f"steps {start} and {start + period} differ by a shift of {shift}"

    return False, f"{kind!r} is not a certificate kind this checker knows"
