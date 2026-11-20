"""M2 Inspector, headless half: structure in a one-dimensional spacetime diagram.

Scope is deliberately narrow, per design §3.2: binary, radius 1-2, spatially periodic. Two
dimensions and radius >= 3 are out of scope and the site must say so.

What this module does, and what it does not:

* :func:`infer_domain` finds a *spatial period* whose cells hold one value in every observed row.
  That is a regular-language domain of the shape ``(0 Sigma)*`` when the pattern is
  ``(0, None)`` for period 2. It is a periodic-domain finder with an explicit observation window,
  not a full CSSR implementation, and it reports ``None`` rather than a best guess.
* :func:`particles` finds connected components of a filtered field and measures their lifetime and
  drift. It reports velocity and lifetime; spatial period and the collision table are the next
  ticket, so nothing here invents them. Components of an *unfiltered* field are the chaotic sea,
  not particles, so a report only claims tracks when it also has a domain to filter with.
* :func:`local_causal_states` clusters each cell's bounded past lightcone by the distribution it
  induces over the next row, using a log-likelihood-ratio test, and reports how surprising each
  state is. Cells with too little evidence get state ``-1``: undecided, not a state.

Every entry point takes an explicit seed or an explicit observation window, because a number
without one is not a result.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from statistics import NormalDist

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
class Particle:
    """One connected spacetime component: where it started, where it ended, how fast it drifted."""

    start: int
    end: int
    start_x: float
    end_x: float
    cells: int

    @property
    def lifetime(self) -> int:
        return self.end - self.start

    @property
    def velocity(self) -> float:
        span = self.lifetime
        return 0.0 if span == 0 else (self.end_x - self.start_x) / span


def particles(
    field: tuple[bytes, ...] | list[bytes], *, min_cells: int = 4
) -> tuple[Particle, ...]:
    """Connected components over (time, space), eight-connected, wrapping in space."""
    if not field:
        raise ValueError("field is empty")
    width = len(field[0])
    height = len(field)
    parent = list(range(width * height))

    def find(node: int) -> int:
        root = node
        while parent[root] != root:
            root = parent[root]
        while parent[node] != root:
            parent[node], node = root, parent[node]
        return root

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    for t, row in enumerate(field):
        for x, cell in enumerate(row):
            if not cell:
                continue
            node = t * width + x
            if x + 1 < width and row[x + 1]:
                union(node, node + 1)
            if t + 1 < height:
                below = (t + 1) * width
                for dx in (-1, 0, 1):
                    neighbour = (x + dx) % width
                    if field[t + 1][neighbour]:
                        union(node, below + neighbour)

    members: dict[int, list[int]] = defaultdict(list)
    for t, row in enumerate(field):
        for x, cell in enumerate(row):
            if cell:
                members[find(t * width + x)].append(t * width + x)
    tracks = []
    for nodes in members.values():
        if len(nodes) < min_cells:
            continue
        times = [node // width for node in nodes]
        start, end = min(times), max(times)
        start_xs = [node % width for node in nodes if node // width == start]
        end_xs = [node % width for node in nodes if node // width == end]
        start_x = sum(start_xs) / len(start_xs)
        drift = sum(end_xs) / len(end_xs) - start_x
        while drift > width / 2:
            drift -= width
        while drift < -width / 2:
            drift += width
        tracks.append(Particle(start, end, start_x, start_x + drift, len(nodes)))
    tracks.sort(key=lambda track: (track.start, track.start_x))
    return tuple(tracks)


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
        text="(0 Sigma)* domain",
        source="design doc 3.2, after Hanson & Crutchfield",
        verified=False,
    ),
    110: Claim(
        text="ether plus gliders",
        source="Cook (2004); periods not yet checked",
        verified=False,
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
    states: LocalStates
    claim: Claim | None

    @property
    def particles_measured(self) -> bool:
        """False when no domain was found, because then nothing has been filtered out."""
        return self.domain is not None

    @property
    def decomposition(self) -> str:
        if self.domain is None:
            return NO_DECOMPOSITION
        return self.domain.describe()


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
    domain = infer_domain(rows, max_period=max_period, settle=settle)
    tracks = particles(filter_domain(rows, domain)) if domain is not None else ()
    return Report(
        number=number,
        width=width,
        steps=steps,
        seed=seed,
        domain=domain,
        tracks=tracks,
        states=local_causal_states(rows),
        claim=claim(number),
    )
