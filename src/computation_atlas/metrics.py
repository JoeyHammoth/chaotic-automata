"""Metrics aggregation: bootstrap intervals and the classification tree.

Both are deliberately small. The intervals are percentile bootstraps over seeds; the tree is a
sequence of explicit thresholds, written here so the map's colouring cannot drift from the document
that explains it.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

# The channels the product carries, in order.
METRICS: tuple[str, ...] = (
    "activity",
    "spatial_entropy",
    "temporal_entropy",
    "compression",
    "damage_rate",
    "damage_died_rate",
    "population",
    "transient",
    "period",
    "lambda",
    "undecided_mass",
    "resolved_mass",
)

CLASSES: tuple[str, ...] = ("static", "periodic", "ordered", "complex", "chaotic", "undecided")
CLASS_CODES = {name: code for code, name in enumerate(CLASSES)}


@dataclass(frozen=True)
class Interval:
    mean: float
    low: float
    high: float


def bootstrap_interval(values: list[float], *, resamples: int = 1000, seed: int = 0) -> Interval:
    """Percentile bootstrap over seeds. Deterministic for a given seed."""
    if not values:
        raise ValueError("cannot bootstrap an empty sample")
    mean = sum(values) / len(values)
    if len(values) == 1:
        return Interval(mean, mean, mean)
    rng = random.Random(seed)
    means = []
    for _ in range(resamples):
        total = 0.0
        for _ in range(len(values)):
            total += values[rng.randrange(len(values))]
        means.append(total / len(values))
    means.sort()
    low = means[int(0.025 * (len(means) - 1))]
    high = means[int(0.975 * (len(means) - 1))]
    return Interval(mean, low, high)


@dataclass(frozen=True)
class RuleSummary:
    """Cross-seed view of one rule."""

    rule: str
    intervals: dict[str, Interval]
    undecided_mass: float
    class_name: str

    @property
    def code(self) -> int:
        return CLASS_CODES[self.class_name]


def classify(
    *,
    activity: float,
    spatial_entropy: float,
    damage_died_rate: float,
    undecided_mass: float,
    period: float | None,
) -> str:
    """The classification tree, in the order the document states it.

    Caps produce `undecided`, never a colour (ADR 0003): the cap check is first, so no amount of
    activity or entropy can promote a capped run to `chaotic`.
    """
    if undecided_mass > 0.0:
        return "undecided"
    if period is not None and period <= 1.5 and activity < 1e-4:
        return "static"
    if period is not None and period <= 8.5 and activity < 0.05:
        return "periodic"
    if damage_died_rate >= 0.5 and spatial_entropy < 0.6:
        return "ordered"
    if activity > 0.45 or spatial_entropy > 0.85:
        return "chaotic"
    if damage_died_rate < 0.5 and 0.25 <= spatial_entropy <= 0.85:
        return "complex"
    return "ordered"
