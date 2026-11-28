"""M2 Inspector, headless half: structure in a one-dimensional spacetime diagram.

Scope is deliberately narrow, per design §3.2: binary, radius 1-2, spatially periodic. Two
dimensions and radius >= 3 are out of scope and the site must say so.

What this module does, and what it does not:

* :func:`infer_domain` finds a *spatial period* whose cells hold one value in every observed row.
  That is a regular-language domain of the shape ``(0 Sigma)*`` when the pattern is
  ``(0, None)`` for period 2. It is a periodic-domain finder with an explicit observation window,
  not a full CSSR implementation, and it reports ``None`` rather than a best guess.
* :func:`particles` chains per-row blobs of a filtered field and measures their lifetime and
  drift. It reports velocity and lifetime; spatial period and the collision table are the next
  ticket, so nothing here invents them. Blobs of an *unfiltered* field are the chaotic sea, not
  particles, so a report only claims tracks when it also has a domain to filter with.
* :func:`local_causal_states` clusters each cell's bounded past lightcone by the distribution it
  induces over the next row, using a log-likelihood-ratio test, and reports how surprising each
  state is. Cells with too little evidence get state ``-1``: undecided, not a state.

Every entry point takes an explicit seed or an explicit observation window, because a number
without one is not a result.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import NormalDist

from .metrics import Interval, bootstrap_interval

ELEMENTARY_RULES = 256


@dataclass(frozen=True)
class Rule1D:
    """A binary one-dimensional rule as a lookup table over neighbourhoods."""

    number: int
    radius: int
    table: bytes

    @property
    def neighbourhoods(self) -> int:
        return 1 << (2 * self.radius + 1)

    def step(self, row: bytes) -> bytes:
        width = len(row)
        if width == 0:
            raise ValueError("row is empty")
        span = range(-self.radius, self.radius + 1)
        table = self.table
        out = bytearray(width)
        for i in range(width):
            index = 0
            for j in span:
                index = index << 1 | row[(i + j) % width]
            out[i] = table[index]
        return bytes(out)


def elementary(number: int) -> Rule1D:
    """Wolfram's numbering: bit ``n`` is the output for neighbourhood ``n``, leftmost bit first."""
    if not 0 <= number < ELEMENTARY_RULES:
        raise ValueError(f"elementary rule {number} is outside 0-{ELEMENTARY_RULES - 1}")
    table = bytes(number >> index & 1 for index in range(8))
    return Rule1D(number, 1, table)


def from_number(number: int, radius: int = 1) -> Rule1D:
    """Radius-2 rules use 32-bit numbers with the same leftmost-first convention."""
    if radius < 1:
        raise ValueError("radius must be at least 1")
    size = 1 << (2 * radius + 1)
    if not 0 <= number < 1 << size:
        raise ValueError(f"rule number {number} does not fit a radius-{radius} table")
    table = bytes(number >> index & 1 for index in range(size))
    return Rule1D(number, radius, table)


def seed_row(width: int, seed: int, density_percent: int = 50) -> bytes:
    """xorshift32 row, the same generator the engine uses for soups."""
    if width <= 0:
        raise ValueError("width must be positive")
    row = bytearray(width)
    state = seed & 0xFFFFFFFF
    for index in range(width):
        state ^= (state << 13) & 0xFFFFFFFF
        state ^= state >> 17
        state ^= (state << 5) & 0xFFFFFFFF
        state &= 0xFFFFFFFF
        row[index] = 1 if state % 100 < density_percent else 0
    return bytes(row)


def spacetime_from(rule: Rule1D, initial: bytes, steps: int) -> tuple[bytes, ...]:
    """``steps + 1`` rows from an explicit initial row; oracles fix the geometry this way."""
    if not initial:
        raise ValueError("initial row is empty")
    if steps < 0:
        raise ValueError("steps must not be negative")
    rows = [bytes(initial)]
    for _ in range(steps):
        rows.append(rule.step(rows[-1]))
    return tuple(rows)


def spacetime(rule: Rule1D, width: int, steps: int, seed: int) -> tuple[bytes, ...]:
    """``steps + 1`` rows, the first from :func:`seed_row`; the seed is the caller's to record."""
    return spacetime_from(rule, seed_row(width, seed), steps)


@dataclass(frozen=True)
class Domain:
    """A spatial period whose cells hold one value across every row of the window."""

    period: int
    pattern: tuple[int | None, ...]
    settle: int
    rows: int

    @property
    def fixed(self) -> tuple[int, ...]:
        return tuple(offset for offset, value in enumerate(self.pattern) if value is not None)

    @property
    def coverage(self) -> float:
        return len(self.fixed) / self.period

    def describe(self) -> str:
        """``(0 Sigma)*`` style rendering, with ``Sigma`` for a free position."""
        symbols = ["Sigma" if value is None else str(value) for value in self.pattern]
        body = " ".join(symbols)
        return f"({body})*"


def infer_domain(
    rows: tuple[bytes, ...] | list[bytes],
    *,
    max_period: int = 8,
    settle: int = 8,
    min_fraction: float = 0.125,
) -> Domain | None:
    """Find the smallest spatial period with a constant cell class, or ``None``.

    A candidate is rejected unless at least ``min_fraction`` of each period is fixed and at least
    ``min_fraction`` of the window's rows are observed. Nothing is returned when no candidate
    qualifies: a rule with no domain decomposition must stay undecided.
    """
    if max_period < 1:
        raise ValueError("max_period must be at least 1")
    if not rows:
        raise ValueError("rows is empty")
    width = len(rows[0])
    observed = list(rows[settle:])
    required = max(8, int(math.ceil(min_fraction * len(rows))))
    if len(observed) < required:
        return None
    best: tuple[float, int, tuple[int | None, ...]] | None = None
    for period in range(1, max_period + 1):
        pattern: list[int | None] = []
        for offset in range(period):
            value = observed[0][offset]
            if all(row[i] == value for row in observed for i in range(offset, width, period)):
                pattern.append(value)
            else:
                pattern.append(None)
        coverage = sum(value is not None for value in pattern) / period
        if coverage < min_fraction:
            continue
        candidate = (coverage, -period, tuple(pattern))
        if best is None or candidate[:2] > best[:2]:
            best = candidate
    if best is None:
        return None
    coverage, negative_period, pattern = best
    if all(value is None for value in pattern):  # pragma: no cover - guard, coverage rules it out
        return None
    return Domain(period=-negative_period, pattern=pattern, settle=settle, rows=len(observed))


def filter_domain(rows: tuple[bytes, ...] | list[bytes], domain: Domain) -> tuple[bytes, ...]:
    """Remove the domain's fixed cells, leaving the particles and collisions standing."""
    out = []
    for row in rows:
        width = len(row)
        body = bytearray(row)
        for offset in domain.fixed:
            for i in range(offset, width, domain.period):
                body[i] = 0
        out.append(bytes(body))
    return tuple(out)


def filtered_field(
    rows: tuple[bytes, ...] | list[bytes],
    domain: Domain | None,
    region: PhaseDomain | None,
) -> tuple[bytes, ...] | None:
    """What the domain does not explain, or ``None`` when neither detector found a domain.

    A periodic domain is removed cell by cell. A region domain forces nothing outright — its walls
    are where the pattern stops being ``(0 Sigma)*`` — so the residue is the wall columns plus any
    cell that breaks a forced zero, which is what a reader sees as a particle. The walls come from
    :func:`domain_tilings`, whose carried frame keeps a kink's wall in the same place from row to
    row. Both halves use this one function: a page that filtered differently from the headless
    report would be two answers to the same question.
    """
    if domain is not None:
        return filter_domain(rows, domain)
    if region is None:
        return None
    residue = []
    for row, tiled in zip(rows, domain_tilings(rows, period=region.period), strict=True):
        walls = set(tiled.walls)
        width = len(row)
        marks = bytearray(width)
        for index in range(width):
            broken = tiled.phases[index] == index % region.period and row[index] != 0
            on_wall = index in walls or (index - 1) % width in walls
            marks[index] = 1 if broken or on_wall else 0
        residue.append(bytes(marks))
    return tuple(residue)


def domain_violations(rows: tuple[bytes, ...] | list[bytes], domain: Domain) -> int:
    """Cells that break the claimed pattern. Zero is the only value a domain may report.

    This is the independent check: it re-reads every fixed offset of every observed row rather than
    trusting the inference that produced the pattern.
    """
    total = 0
    for row in rows[domain.settle:]:
        for offset, value in enumerate(domain.pattern):
            if value is None:
                continue
            for i in range(offset, len(row), domain.period):
                total += int(row[i] != value)
    return total


@dataclass(frozen=True)
class DomainTiling:
    """A row tiled by ``(0 Sigma)*`` regions of either phase, with the walls between them.

    Phase ``p`` at position ``i`` asserts ``row[i] == 0`` whenever ``i % period == p``; the other
    positions are free. A wall is a change of phase between neighbouring cells (wrapping around),
    which is where a particle sits in the domain-plus-kinks picture. Violations are minimised
    first and walls second: a wall that repairs broken forced cells is worth paying for.
    """

    phases: tuple[int, ...]
    walls: tuple[int, ...]
    violations: int
    width: int
    period: int

    @property
    def forced(self) -> int:
        return sum(1 for index, phase in enumerate(self.phases) if index % self.period == phase)

    @property
    def coverage(self) -> float:
        """Fraction of forced cells that actually hold 0; 1.0 when the tiling has no violations."""
        if not self.forced:
            return 0.0
        return (self.forced - self.violations) / self.forced

    def describe(self) -> str:
        symbols = ["0"] + ["Sigma"] * (self.period - 1)
        return f"({', '.join(symbols)})*"


def _best_tiling(
    row: bytes,
    start: int,
    period: int,
    previous: tuple[int, ...] | None = None,
) -> tuple[int, int, int, list[int]]:
    """``(violations, walls, disagreement, phases)`` for the best tiling from ``start``.

    ``disagreement`` counts cells whose phase differs from ``previous``, the tiling of the row
    above. It is the third criterion: a row still minimises violations first and walls second,
    so continuity only decides between tilings that are otherwise equal.
    """
    width = len(row)
    impossible = (1 << 30, 1 << 30, 1 << 30, -1)
    best = [impossible] * period
    best[start] = (0, 0, 0 if previous is None else int(start != previous[0]), -1)
    history: list[list[tuple[int, int, int, int]]] = [list(best)]
    for i in range(1, width):
        current = [impossible] * period
        for prior in range(period):
            violations, walls, disagreement, _ = best[prior]
            if violations >= 1 << 30:
                continue
            for phase in range(period):
                broken = 1 if (i % period == phase and row[i] != 0) else 0
                extra = 0 if previous is None else int(phase != previous[i])
                candidate = (
                    violations + broken,
                    walls + int(phase != prior),
                    disagreement + extra,
                    prior,
                )
                if candidate[:3] < current[phase][:3]:
                    current[phase] = candidate
        best = current
        history.append(current)
    end = min(range(period), key=lambda phase: best[phase][:3])
    violations, walls, disagreement = best[end][0], best[end][1], best[end][2]
    if end != start:
        walls += 1
    phases = [0] * width
    phase = end
    for i in range(width - 1, 0, -1):
        phases[i] = phase
        phase = history[i][phase][3]
    phases[0] = start
    return violations, walls, disagreement, phases


def _tiling(
    row: bytes, period: int, previous: tuple[int, ...] | None = None
) -> DomainTiling:
    if not row:
        raise ValueError("row is empty")
    if period < 2:
        raise ValueError("period must be at least 2")
    violations, _, _, phases = min(
        (_best_tiling(row, start, period, previous) for start in range(period)),
        key=lambda result: result[:3],
    )
    width = len(row)
    walls = tuple(i for i in range(width) if phases[i] != phases[(i - 1) % width])
    return DomainTiling(
        phases=tuple(phases), walls=walls, violations=violations, width=width, period=period
    )


def domain_tiling(row: bytes, *, period: int = 2) -> DomainTiling:
    """Tile one row with ``(0 Sigma)*`` regions of either phase, minimising violations first.

    The two-phase reading is Wolfram's decomposition of a rule-18 configuration into domains in
    which either all even-numbered or all odd-numbered sites are zero, separated by kinks. A
    single phase over the whole row is the special case with zero walls.
    """
    return _tiling(row, period)


def _phase_shift(row: bytes, previous: tuple[int, ...], period: int) -> int:
    """The global phase shift that best explains this row's ones against ``previous``.

    Rule 18's domain flips phase every step, so comparing a row with the row above directly
    would make every cell disagree and leave the continuity criterion nothing to choose between.
    The shift is the one that puts the fewest ones on a forced zero; for rule 18 it is 1, for a
    rule whose domain keeps its phase it is 0.
    """
    best = (len(row) + 1, 0)
    for shift in range(period):
        mismatches = sum(
            1
            for index, cell in enumerate(row)
            if cell and (previous[index] + shift) % period == index % period
        )
        if mismatches < best[0]:
            best = (mismatches, shift)
    return best[1]


def domain_tilings(
    rows: tuple[bytes, ...] | list[bytes], *, period: int = 2
) -> tuple[DomainTiling, ...]:
    """Tile a window row by row, carrying each row's phase frame into the next.

    Tiling every row independently lets the optimiser pick a different frame above and below a
    kink, so a wall can jump even where the pattern does not. Carrying the frame makes wall
    positions a property of the field rather than of the tie-break: each row still minimises
    violations and walls first, and only then agrees with the row above where it can. The row
    above is shifted by the phase change the rule itself makes, so a domain that alternates
    phase every step does not spend the criterion on a global flip.
    """
    if not rows:
        raise ValueError("rows is empty")
    if period < 2:
        raise ValueError("period must be at least 2")
    tilings: list[DomainTiling] = []
    previous: tuple[int, ...] | None = None
    for row in rows:
        reference = None
        if previous is not None:
            shift = _phase_shift(row, previous, period)
            reference = tuple((phase + shift) % period for phase in previous)
        tiling = _tiling(row, period, reference)
        tilings.append(tiling)
        previous = tiling.phases
    return tuple(tilings)


@dataclass(frozen=True)
class PhaseDomain:
    """``(0 Sigma)*`` regions across a window of rows, and the walls that separate them."""

    period: int
    rows: int
    width: int
    walls: tuple[int, ...]

    @property
    def walls_mean(self) -> float:
        return sum(self.walls) / len(self.walls)

    @property
    def wall_fraction(self) -> float:
        """The worst row's walls as a fraction of its width."""
        return max(self.walls) / self.width

    def describe(self) -> str:
        symbols = ["0"] + ["Sigma"] * (self.period - 1)
        return f"({', '.join(symbols)})* regions separated by walls"


def infer_phase_domain(
    rows: tuple[bytes, ...] | list[bytes],
    *,
    period: int = 2,
    max_wall_fraction: float = 0.125,
) -> PhaseDomain | None:
    """Recover a two-phase ``(0 Sigma)*`` domain, or ``None`` when the rows do not tile cleanly.

    Rows are tiled in order with :func:`domain_tilings`, so each row carries the previous row's
    phase frame. The wall count is the same as an independent tiling, but the walls line up.

    Zero violations is not enough on its own: a tiling may wall off everything, which is exactly
    what rule 30 does at a third of the row. The wall budget is what separates a domain with
    particles in it from no domain at all. Measured at 256 cells, rules 18, 36 and 164 need
    1.8-6.3% of the row as walls, while rules 30, 54 and 22 need 26-34%; the default of 1/8 sits
    in that gap. A rule that fails either test gets ``None``, never a best guess.
    """
    if not rows:
        raise ValueError("rows is empty")
    if not 0 < max_wall_fraction < 1:
        raise ValueError("max_wall_fraction must be between 0 and 1")
    tilings = domain_tilings(rows, period=period)
    if any(tiling.violations for tiling in tilings):
        return None
    walls = tuple(len(tiling.walls) for tiling in tilings)
    if max(walls) > max_wall_fraction * len(rows[0]):
        return None
    return PhaseDomain(period=period, rows=len(rows), width=len(rows[0]), walls=walls)


@dataclass(frozen=True)
class SpatialMachine:
    """A spatial epsilon-machine: bounded histories merged when their next-symbol laws agree.

    ``emissions[state]`` is ``(zeros, total)``; a *forcing* state emits 0 every time it is
    observed. ``transitions`` holds ``(state, symbol, next state, weight)``. Histories seen fewer
    than ``min_count`` times are left undecided (state ``-1``) and never merged into a state.
    """

    emissions: tuple[tuple[int, int], ...]
    transitions: tuple[tuple[int, int, int, int], ...]
    history: int
    alpha: float
    min_count: int
    histories: int
    undecided: int

    @property
    def count(self) -> int:
        return len(self.emissions)

    @property
    def forcing(self) -> tuple[int, ...]:
        return tuple(i for i, (zeros, total) in enumerate(self.emissions) if zeros == total)

    def probability_zero(self, state: int) -> float:
        zeros, total = self.emissions[state]
        return zeros / total if total else 0.0

    def deterministic_cycle(self, *, limit: int = 16) -> tuple[int, ...] | None:
        """The symbol cycle the machine runs on when every state has one outgoing move.

        This is the domain read back out of the machine: on an exact ``(0 1)*`` language the
        shortest cycle is the two symbols that alternate. A state with two outgoing moves makes
        the machine non-deterministic there, and ``None`` is returned rather than a guess.
        """
        outgoing: dict[int, list[tuple[int, int]]] = {}
        for state, symbol, target, _ in self.transitions:
            outgoing.setdefault(state, []).append((symbol, target))
        cycles: list[tuple[int, ...]] = []
        for start in outgoing:
            symbols: list[int] = []
            state = start
            seen: dict[int, int] = {}
            while state not in seen and len(symbols) < limit:
                moves = outgoing.get(state, [])
                if len(moves) != 1:
                    break
                seen[state] = len(symbols)
                symbol, state = moves[0]
                symbols.append(symbol)
            else:
                if state == start and symbols:
                    cycles.append(tuple(symbols))
        return min(cycles, key=len) if cycles else None


def spatial_machine(
    rows: tuple[bytes, ...] | list[bytes],
    *,
    history: int = 4,
    alpha: float = 0.01,
    min_count: int = 64,
) -> SpatialMachine:
    """Infer causal states over spatial strings, CSSR-style and with bounded history length.

    Histories of length ``history`` are built around each row cyclically, counted against the
    symbol that follows, and merged greedily with a G-test at ``alpha``. This is the design's
    "simple history-based clustering with a statistical test" route; it is not the full CSSR
    splitting loop, and the docstring says so rather than the name implying otherwise.
    """
    if history < 1:
        raise ValueError("history must be at least 1")
    if not rows:
        raise ValueError("rows is empty")
    counts: dict[int, list[int]] = {}
    for row in rows:
        width = len(row)
        for i in range(width):
            key = 0
            for offset in range(history, 0, -1):
                key = key << 1 | row[(i - offset) % width]
            counts.setdefault(key, [0, 0])[row[i]] += 1
    critical = chi2_critical(1, alpha)
    assignment: dict[int, int] = {}
    centres: list[list[int]] = []
    for key in sorted(counts, key=lambda item: (-sum(counts[item]), item)):
        seen = counts[key]
        if sum(seen) < min_count:
            assignment[key] = -1
            continue
        for state, centre in enumerate(centres):
            if _g_test(seen, centre) <= critical:
                assignment[key] = state
                for index, value in enumerate(seen):
                    centre[index] += value
                break
        else:
            assignment[key] = len(centres)
            centres.append(list(seen))

    moves: dict[tuple[int, int, int], int] = {}
    for key, state in assignment.items():
        if state < 0:
            continue
        bits = [(key >> (history - 1 - offset)) & 1 for offset in range(history)]
        for symbol in (0, 1):
            following = 0
            for bit in [*bits[1:], symbol]:
                following = following << 1 | bit
            target = assignment.get(following)
            if target is None or target < 0:
                continue
            pair = (state, symbol, target)
            moves[pair] = moves.get(pair, 0) + sum(counts[key])
    return SpatialMachine(
        emissions=tuple((centre[0], sum(centre)) for centre in centres),
        transitions=tuple(
            (state, symbol, target, weight)
            for (state, symbol, target), weight in sorted(moves.items())
        ),
        history=history,
        alpha=alpha,
        min_count=min_count,
        histories=len(counts),
        undecided=sum(1 for state in assignment.values() if state < 0),
    )


@dataclass(frozen=True)
class SpatialInference:
    """Domain tiling and machine state counts over independent seeds, one seed at a time.

    ``state_counts`` is reported as a distribution rather than a single number: a causal-state
    count that moves with the seed is finite-data bias, and quoting one run hides it.
    """

    number: int
    width: int
    steps: int
    seeds: int
    history: int
    alpha: float
    state_counts: tuple[int, ...]
    state_interval: Interval
    walls: tuple[float, ...]
    violations: tuple[float, ...]

    @property
    def tiled(self) -> bool:
        """True when every seed's window tiles with no violation at all."""
        return all(value == 0 for value in self.violations)

    @property
    def walls_mean(self) -> float:
        return sum(self.walls) / len(self.walls)


def spatial_inference(
    number: int,
    *,
    width: int = 256,
    steps: int = 256,
    seed: int = 11,
    seeds: int = 10,
    history: int = 4,
    alpha: float = 0.01,
    min_count: int = 64,
    radius: int = 1,
    settle: int = 8,
) -> SpatialInference:
    """Run the tiling and the epsilon-machine on ``seeds`` independent runs of one rule."""
    if seeds < 1:
        raise ValueError("seeds must be at least 1")
    rule = elementary(number) if radius == 1 else from_number(number, radius)
    counts: list[int] = []
    walls: list[float] = []
    violations: list[float] = []
    for index in range(seeds):
        rows = spacetime(rule, width, steps, seed + index * 7919)[settle:]
        tilings = domain_tilings(rows)
        walls.append(sum(len(tiling.walls) for tiling in tilings) / len(tilings))
        violations.append(sum(tiling.violations for tiling in tilings) / len(tilings))
        machine = spatial_machine(rows, history=history, alpha=alpha, min_count=min_count)
        counts.append(machine.count)
    return SpatialInference(
        number=number,
        width=width,
        steps=steps,
        seeds=seeds,
        history=history,
        alpha=alpha,
        state_counts=tuple(counts),
        state_interval=bootstrap_interval(
            [float(value) for value in counts], resamples=200, seed=seed
        ),
        walls=tuple(walls),
        violations=tuple(violations),
    )

@dataclass(frozen=True)
class Particle:
    """A particle track: one blob per row, chained through time, with its measured period.

    ``period`` is ``(time, space)`` when the track's cell pattern repeats exactly after that many
    rows shifted by that many cells. ``None`` means the pattern was not observed to repeat within
    ``period_cap``, which is an undecided period, not a period of one.
    """

    ident: int
    start: int
    end: int
    shapes: tuple[tuple[int, ...], ...]
    period: tuple[int, int] | None
    velocity: float

    @property
    def lifetime(self) -> int:
        return self.end - self.start

    @property
    def cells(self) -> int:
        return sum(len(shape) for shape in self.shapes)

    @property
    def start_x(self) -> float:
        return _mean(self.shapes[0])

    @property
    def end_x(self) -> float:
        return _mean(self.shapes[-1])


@dataclass(frozen=True)
class Collision:
    """Tracks meeting: two or more merge into one, or one splits into two or more."""

    time: int
    kind: str
    inputs: tuple[int, ...]
    outputs: tuple[int, ...]


@dataclass(frozen=True)
class TrackSet:
    particles: tuple[Particle, ...]
    collisions: tuple[Collision, ...]


def _mean(values: tuple[int, ...] | list[int]) -> float:
    return sum(values) / len(values)


def _circular(delta: float, width: int) -> float:
    while delta > width / 2:
        delta -= width
    while delta < -width / 2:
        delta += width
    return delta


def _runs(row: bytes) -> list[tuple[int, ...]]:
    runs: list[tuple[int, ...]] = []
    current: list[int] = []
    for x, cell in enumerate(row):
        if cell:
            current.append(x)
        elif current:
            runs.append(tuple(current))
            current = []
    if current:
        runs.append(tuple(current))
    return runs


def _measure_period(
    shapes: tuple[tuple[int, ...], ...], width: int, cap: int
) -> tuple[int, int] | None:
    """Smallest ``(time, space)`` for which the track's cells repeat exactly, or ``None``."""
    span = len(shapes) - 1
    for tau in range(1, min(cap, span) + 1):
        drift: int | None = None
        comparisons = 0
        for t in range(span + 1 - tau):
            before, after = shapes[t], shapes[t + tau]
            step = round(_circular(_mean(after) - _mean(before), width))
            if drift is None:
                drift = step
            elif drift != step:
                break
            if {(x + drift) % width for x in before} != set(after):
                break
            comparisons += 1
        else:
            if comparisons >= 2 and drift is not None:
                return (tau, drift)
    return None


def track(
    field: tuple[bytes, ...] | list[bytes],
    *,
    min_cells: int = 4,
    period_cap: int = 32,
    max_speed: float = 1.5,
) -> TrackSet:
    """Chain per-row blobs through time, then measure periods and collisions.

    Blobs, not connected components: a component merges everything that ever touches, which would
    erase exactly the collisions the module exists to report.
    """
    if not field:
        raise ValueError("field is empty")
    width = len(field[0])
    if any(len(row) != width for row in field):
        raise ValueError("every row must be the same width")
    rows = [_runs(row) for row in field]

    next_of: dict[tuple[int, int], tuple[int, int]] = {}
    prev_of: dict[tuple[int, int], tuple[int, int]] = {}
    successors: dict[tuple[int, int], list[tuple[int, int]]] = {}
    predecessors: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for t in range(len(rows) - 1):
        gaps: dict[tuple[int, int], float] = {}
        for i, before in enumerate(rows[t]):
            for j, after in enumerate(rows[t + 1]):
                gap = abs(_circular(_mean(after) - _mean(before), width))
                if gap <= max_speed:
                    gaps[(i, j)] = gap
                    successors.setdefault((t, i), []).append((t + 1, j))
                    predecessors.setdefault((t + 1, j), []).append((t, i))
        for i, j in sorted(gaps, key=lambda pair: (gaps[pair], pair)):
            if (t, i) in next_of or (t + 1, j) in prev_of:
                continue
            next_of[(t, i)] = (t + 1, j)
            prev_of[(t + 1, j)] = (t, i)

    chains: list[list[tuple[int, int]]] = []
    for t in range(len(rows)):
        for i in range(len(rows[t])):
            node = (t, i)
            if node in prev_of:
                continue
            chain = [node]
            while chain[-1] in next_of:
                chain.append(next_of[chain[-1]])
            if sum(len(rows[time][index]) for time, index in chain) >= min_cells:
                chains.append(chain)

    built = []
    for chain in chains:
        shapes = tuple(rows[time][index] for time, index in chain)
        start, end = chain[0][0], chain[-1][0]
        period = _measure_period(shapes, width, period_cap)
        if period is not None:
            velocity = period[1] / period[0]
        elif end > start:
            velocity = round(_circular(_mean(shapes[-1]) - _mean(shapes[0]), width)) / (end - start)
        else:
            velocity = 0.0
        built.append((start, _mean(shapes[0]), chain, shapes, period, velocity))
    built.sort(key=lambda item: (item[0], item[1], item[2]))

    tracks: list[Particle] = []
    blob_track: dict[tuple[int, int], int] = {}
    for ident, (start, _, chain, shapes, period, velocity) in enumerate(built):
        for node in chain:
            blob_track[node] = ident
        tracks.append(
            Particle(
                ident=ident,
                start=start,
                end=start + len(shapes) - 1,
                shapes=shapes,
                period=period,
                velocity=velocity,
            )
        )

    collisions: list[Collision] = []
    for node, sources in predecessors.items():
        if len(sources) < 2 or node not in blob_track:
            continue
        inputs = tuple(sorted({blob_track[source] for source in sources if source in blob_track}))
        if len(inputs) < 2:
            continue
        collisions.append(
            Collision(time=node[0], kind="merge", inputs=inputs, outputs=(blob_track[node],))
        )
    for node, targets in successors.items():
        if len(targets) < 2 or node not in blob_track:
            continue
        if node in predecessors and len(predecessors[node]) >= 2:
            continue  # the same meeting, already recorded from its outgoing side
        outputs = tuple(sorted({blob_track[target] for target in targets if target in blob_track}))
        if len(outputs) < 2:
            continue
        collisions.append(
            Collision(time=node[0], kind="split", inputs=(blob_track[node],), outputs=outputs)
        )
    collisions.sort(key=lambda event: (event.time, event.kind, event.inputs, event.outputs))
    return TrackSet(tuple(tracks), tuple(collisions))


def particles(
    field: tuple[bytes, ...] | list[bytes], *, min_cells: int = 4
) -> tuple[Particle, ...]:
    """The tracks alone, for callers that do not need the collision table."""
    return track(field, min_cells=min_cells).particles


def particle_count(field: tuple[bytes, ...] | list[bytes], *, min_lifetime: int = 8) -> int:
    """The null-model statistic: long-lived tracks whose period was actually measured."""
    return sum(
        1
        for particle in particles(field)
        if particle.lifetime >= min_lifetime and particle.period is not None
    )


@dataclass(frozen=True)
class Calibration:
    """Real spacetimes against shuffled-time nulls on one named statistic, over many seeds.

    The statistic is :func:`particle_count`: tracks that live at least ``min_lifetime`` rows and
    whose period was actually measured. The false-positive rate is a permutation test on counts --
    the fraction of null runs whose count reaches the real mean -- because "any track at all" is
    meaningless on a field with density: shuffled rows still contain blobs. Where the two
    distributions do not separate, :attr:`passes` is false and the rule has no particle claim,
    however many tracks it has.
    """

    seed: int
    seeds: int
    min_lifetime: int
    real: tuple[int, ...]
    null: tuple[int, ...]
    false_positive_rate: float
    alpha: float
    state_counts: tuple[int, ...]
    state_interval: Interval

    @property
    def real_mean(self) -> float:
        return sum(self.real) / len(self.real)

    @property
    def null_mean(self) -> float:
        return sum(self.null) / len(self.null)

    @property
    def separates(self) -> bool:
        """True when the real field carries more of the statistic than its nulls do."""
        return self.real_mean > self.null_mean

    @property
    def passes(self) -> bool:
        """True when the nulls reach the real mean no more often than ``alpha`` allows."""
        return self.separates and self.false_positive_rate <= self.alpha


def calibrate(
    number: int,
    *,
    width: int = 128,
    steps: int = 96,
    seed: int = 11,
    seeds: int = 20,
    min_lifetime: int = 8,
    alpha: float = 0.05,
    radius: int = 1,
) -> Calibration:
    """Measure the particle statistic on real and shuffled fields, one seed at a time."""
    if seeds < 1:
        raise ValueError("seeds must be at least 1")
    rule = elementary(number) if radius == 1 else from_number(number, radius)
    real: list[int] = []
    null: list[int] = []
    counts: list[int] = []
    for index in range(seeds):
        base = seed + index * 7919
        rows = spacetime(rule, width, steps, base)
        domain = infer_domain(rows)
        field = filter_domain(rows, domain) if domain is not None else rows
        real.append(particle_count(field, min_lifetime=min_lifetime))
        null_rows = shuffled(rows, base ^ 0x5F5F5F5F)
        null_domain = infer_domain(null_rows)
        null_field = filter_domain(null_rows, null_domain) if null_domain is not None else null_rows
        null.append(particle_count(null_field, min_lifetime=min_lifetime))
        counts.append(local_causal_states(rows).count)
    threshold = sum(real) / len(real)
    if threshold > 0:
        false_positive_rate = sum(1 for value in null if value >= threshold) / len(null)
    else:
        false_positive_rate = sum(1 for value in null if value) / len(null)
    return Calibration(
        seed=seed,
        seeds=seeds,
        min_lifetime=min_lifetime,
        real=tuple(real),
        null=tuple(null),
        false_positive_rate=false_positive_rate,
        alpha=alpha,
        state_counts=tuple(counts),
        state_interval=bootstrap_interval(
            [float(value) for value in counts], resamples=200, seed=seed
        ),
    )


def _g_test(left: list[int], right: list[int]) -> float:
    """Log-likelihood-ratio statistic for two samples over the same categories."""
    total_left, total_right = sum(left), sum(right)
    if total_left == 0 or total_right == 0:
        return 0.0
    total = total_left + total_right
    statistic = 0.0
    for a, b in zip(left, right, strict=False):
        expected_left = (a + b) * total_left / total
        expected_right = (a + b) * total_right / total
        if a and expected_left:
            statistic += 2 * a * math.log(a / expected_left)
        if b and expected_right:
            statistic += 2 * b * math.log(b / expected_right)
    return statistic


def chi2_critical(dof: int, alpha: float) -> float:
    """Critical value of a chi-square with ``dof`` degrees of freedom at ``alpha``.

    One and two degrees of freedom are exact (a squared normal quantile, and ``-2 ln alpha``), which
    matters because the G-test here often has few categories. Above that, Wilson-Hilferty keeps the
    module dependency-free and is close enough for a merge test; the tests pin both ends.
    """
    if dof < 1:
        raise ValueError("dof must be at least 1")
    if not 0 < alpha < 1:
        raise ValueError("alpha must be between 0 and 1")
    if dof == 1:
        return NormalDist().inv_cdf(1 - alpha / 2) ** 2
    if dof == 2:
        return -2 * math.log(alpha)
    z = NormalDist().inv_cdf(1 - alpha)
    factor = 1 - 2 / (9 * dof) + z * math.sqrt(2 / (9 * dof))
    return dof * factor**3


@dataclass(frozen=True)
class LocalStates:
    """Per-cell causal state of a bounded past lightcone, and how surprising that state is."""

    states: tuple[tuple[int, ...], ...]
    complexity: tuple[tuple[float, ...], ...]
    count: int
    past: int
    future: int
    undecided: int

    def row(self, index: int) -> tuple[int, ...]:
        return self.states[index]


def _cones(width: int, depth: int) -> list[tuple[int, int]]:
    return [(k, j) for k in range(1, depth + 1) for j in range(-k, k + 1)]


def local_causal_states(
    rows: tuple[bytes, ...] | list[bytes],
    *,
    past: int = 2,
    future: int = 1,
    alpha: float = 0.01,
    min_count: int = 8,
) -> LocalStates:
    """Cluster past lightcones by the distribution each induces over the next row.

    Histories observed fewer than ``min_count`` times inherit nothing: they are reported as state
    ``-1``, which is the module's "undecided", and excluded from the state count.
    """
    if past < 1 or future < 1:
        raise ValueError("past and future depths must be at least 1")
    if len(rows) <= past + future:
        raise ValueError("not enough rows for the requested lightcone depths")
    width = len(rows[0])
    depth_cells = _cones(width, past)
    future_width = 2 * future + 1
    categories = 1 << future_width

    histories: dict[int, list[int]] = {}
    owner: dict[tuple[int, int], int] = {}
    for t in range(past, len(rows) - future):
        for i in range(width):
            key = 0
            for k, j in depth_cells:
                key = key << 1 | rows[t - k][(i + j) % width]
            counts = histories.get(key)
            if counts is None:
                counts = [0] * categories
                histories[key] = counts
            outcome = 0
            for j in range(-future, future + 1):
                outcome = outcome << 1 | rows[t + future][(i + j) % width]
            counts[outcome] += 1
            owner[(t, i)] = key

    critical = chi2_critical(categories - 1, alpha)
    order = sorted(histories, key=lambda key: (-sum(histories[key]), key))
    centres: list[list[int]] = []
    assignment: dict[int, int] = {}
    for key in order:
        counts = histories[key]
        if sum(counts) < min_count:
            assignment[key] = -1
            continue
        for state, centre in enumerate(centres):
            if _g_test(counts, centre) <= critical:
                assignment[key] = state
                for index, value in enumerate(counts):
                    centre[index] += value
                break
        else:
            assignment[key] = len(centres)
            centres.append(list(counts))

    totals = [sum(centre) for centre in centres]
    grand = sum(totals) or 1
    surprise = [math.log2(grand / total) if total else 0.0 for total in totals]

    state_rows: list[tuple[int, ...]] = []
    complexity_rows: list[tuple[float, ...]] = []
    undecided = 0
    for t in range(len(rows)):
        states_row: list[int] = []
        complexity_row: list[float] = []
        for i in range(width):
            key = owner.get((t, i))
            if key is None:
                states_row.append(-1)
                complexity_row.append(0.0)
                continue
            state = assignment[key]
            if state < 0:
                undecided += 1
                states_row.append(-1)
                complexity_row.append(0.0)
                continue
            states_row.append(state)
            complexity_row.append(surprise[state])
        state_rows.append(tuple(states_row))
        complexity_rows.append(tuple(complexity_row))

    return LocalStates(
        states=tuple(state_rows),
        complexity=tuple(complexity_rows),
        count=len(centres),
        past=past,
        future=future,
        undecided=undecided,
    )


@dataclass(frozen=True)
class StateSeparation:
    """Does the complexity field put particles where the domain ends?

    ``ratio`` is the mean local statistical complexity at the tiling's wall cells over the mean
    everywhere else; ``null_ratio`` is the largest ratio the same walls reach when rotated against
    the complexity field, which keeps each row's wall count and spacing and breaks only the
    alignment. ``separates`` is ``ratio > null_ratio``, and nothing weaker is called a separation:
    a ratio that the best accident matches says the walls were never what the heatmap was showing.
    """

    ratio: float
    null_ratio: float
    wall_complexity: float
    bulk_complexity: float
    wall_cells: int
    rows: int
    states: int
    rotations: int

    @property
    def separates(self) -> bool:
        return self.ratio > self.null_ratio


def state_separation(
    rows: tuple[bytes, ...] | list[bytes],
    *,
    settle: int = 8,
    past: int = 2,
    future: int = 1,
    reach: int = 1,
    rotations: int = 64,
) -> StateSeparation | None:
    """Test that the heatmap marks particles rather than domains, or return ``None``.

    The heatmap colours each cell by the surprise of its causal state, which is high where the field
    is not the domain. This measures that rather than leaving it to the eye: mean complexity on the
    kink mask against the mean elsewhere, and the same comparison under a rotation null.

    The mask is each wall and its ``reach`` neighbours, because a phase flip is a boundary between
    cells and the defect sits on both sides of it. Measured over six seeds at 256 cells, rule 18's
    wall cell alone scores 0.88-0.91 of the rotation null — it does not separate — while the kink
    mask separates on all six by 5-9%.

    A rule with no phase domain gets ``None``. Rule 30's tiling walls off a third of every row, so a
    ratio over those walls would describe the absence of a decomposition, not a particle.
    """
    if not rows:
        raise ValueError("rows is empty")
    if settle < 0:
        raise ValueError("settle must not be negative")
    if reach < 0:
        raise ValueError("reach must not be negative")
    if rotations < 1:
        raise ValueError("rotations must be at least 1")
    body = list(rows[settle:])
    if not body:
        raise ValueError("no rows left after settle")
    if infer_phase_domain(body) is None:
        return None
    states = local_causal_states(rows, past=past, future=future)
    width = len(rows[0])
    walls: list[tuple[int, ...]] = []
    complexity: list[tuple[float, ...]] = []
    totals: list[float] = []
    for t in range(settle, len(rows)):
        marks = domain_tiling(rows[t]).walls
        mask = {(i + d) % width for i in marks for d in range(-reach, reach + 1)}
        walls.append(tuple(sorted(mask)))
        complexity.append(states.complexity[t])
        totals.append(sum(states.complexity[t]))

    def measure(shift: int) -> tuple[float, float, int]:
        """``(mean at walls, mean elsewhere, wall cells)`` with the walls rotated by ``shift``."""
        inside = 0.0
        count = 0
        for row_complexity, row_walls, _ in zip(complexity, walls, totals, strict=True):
            inside += sum(row_complexity[(i + shift) % width] for i in row_walls)
            count += len(row_walls)
        cells = len(complexity) * width
        if count == 0 or count == cells:
            return 0.0, 0.0, count
        return inside / count, (sum(totals) - inside) / (cells - count), count

    wall_mean, bulk_mean, wall_cells = measure(0)
    if wall_mean <= 0.0 or bulk_mean <= 0.0:
        return None
    null_ratio = 0.0
    for shift in range(1, rotations + 1):
        rotated_wall, rotated_bulk, _ = measure(shift)
        if rotated_bulk > 0:
            null_ratio = max(null_ratio, rotated_wall / rotated_bulk)
    return StateSeparation(
        ratio=wall_mean / bulk_mean,
        null_ratio=null_ratio,
        wall_complexity=wall_mean,
        bulk_complexity=bulk_mean,
        wall_cells=wall_cells,
        rows=len(complexity),
        states=states.count,
        rotations=rotations,
    )


NO_DECOMPOSITION = "no known domain decomposition"


@dataclass(frozen=True)
class Claim:
    """A literature claim about a rule, and whether this code has actually reproduced it.

    ``verified`` is false whenever the claim came from the design document rather than from a run of
    this module: an unverified claim may be displayed, but never in a way that looks measured.
    """

    text: str
    source: str
    verified: bool


CLAIMS: dict[int, Claim] = {
    18: Claim(
        text="(0 Sigma)* domains separated by walls",
        source="Wolfram (1983); Hanson & Crutchfield (1997); Cenek (2011)",
        verified=True,
    ),
    110: Claim(
        text="ether 00010011011111: 14 cells by 7 steps",
        source="Cook (2004), Complex Systems 15(1), §3.1",
        verified=True,
    ),
}


def claim(number: int) -> Claim | None:
    """The literature's structural claim for a rule, or ``None`` when there is none to make."""
    return CLAIMS.get(number)


def known_structure(number: int) -> str | None:
    """The claim's text alone, for callers that only need the label."""
    found = claim(number)
    return None if found is None else found.text


def shuffled(rows: tuple[bytes, ...] | list[bytes], seed: int) -> tuple[bytes, ...]:
    """The null model: the same rows in a random time order, so no causal structure can remain."""
    order = list(range(len(rows)))
    state = seed & 0xFFFFFFFF

    def draw() -> int:
        nonlocal state
        state ^= (state << 13) & 0xFFFFFFFF
        state ^= state >> 17
        state ^= (state << 5) & 0xFFFFFFFF
        state &= 0xFFFFFFFF
        return state

    for index in range(len(order) - 1, 0, -1):
        swap = draw() % (index + 1)
        order[index], order[swap] = order[swap], order[index]
    return tuple(rows[index] for index in order)


@dataclass(frozen=True)
class Report:
    """One rule's headless inspection: the window, what was found, and what was not."""

    number: int
    width: int
    steps: int
    seed: int
    domain: Domain | None
    tracks: tuple[Particle, ...]
    collisions: tuple[Collision, ...]
    states: LocalStates
    claim: Claim | None
    region_domain: PhaseDomain | None

    @property
    def particles_measured(self) -> bool:
        """False when neither detector found a domain, because then nothing was filtered out."""
        return self.domain is not None or self.region_domain is not None

    @property
    def decomposition(self) -> str:
        if self.domain is not None:
            return self.domain.describe()
        if self.region_domain is not None:
            return self.region_domain.describe()
        return NO_DECOMPOSITION


def inspect(
    number: int,
    *,
    width: int = 256,
    steps: int = 256,
    seed: int = 11,
    radius: int = 1,
    max_period: int = 8,
    settle: int = 8,
) -> Report:
    rule = elementary(number) if radius == 1 else from_number(number, radius)
    rows = spacetime(rule, width, steps, seed)
    observed = rows[settle:]
    domain = infer_domain(rows, max_period=max_period, settle=settle)
    region = infer_phase_domain(observed)
    field = filtered_field(observed, domain, region)
    tracked = track(field) if field is not None else TrackSet((), ())
    return Report(
        number=number,
        width=width,
        steps=steps,
        seed=seed,
        domain=domain,
        tracks=tracked.particles,
        collisions=tracked.collisions,
        states=local_causal_states(rows),
        claim=claim(number),
        region_domain=region,
    )
