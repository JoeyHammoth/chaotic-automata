"""Chart geometry: 512 x 512 Life-like rules, Gray-coded on both axes (design §6.2).

x is the birth mask, y the survival mask. The chart is ordered so that **adjacent columns differ by
exactly one birth condition**, which is what makes coastlines geometric rather than a display
artefact. That ordering places mask ``m`` at index ``m ^ (m >> 1)`` — the reflected Gray code — so
:func:`mask_at` and :func:`index_of` are inverses, and :class:`Landmark` carries masks rather than
indices so a label cannot drift out of sync with its coordinates.
"""

from __future__ import annotations

from dataclasses import dataclass

from .rules import LifeLike

CHART = 512


def mask_at(index: int) -> int:
    """The mask drawn at chart position ``index``: the reflected Gray code."""
    if index < 0 or index >= CHART:
        raise ValueError(f"chart index {index} is outside 0..{CHART - 1}")
    return index ^ (index >> 1)


def index_of(mask: int) -> int:
    """Inverse of :func:`mask_at`: where a mask sits on the chart."""
    if not 0 <= mask < CHART:
        raise ValueError(f"mask {mask} is outside 0..{CHART - 1}")
    index = 0
    while mask > 0:
        index ^= mask
        mask >>= 1
    return index


def rule_at(birth_index: int, survival_index: int) -> LifeLike:
    return LifeLike.from_mask(mask_at(birth_index) | mask_at(survival_index) << 9)


def canonical_at(birth_index: int, survival_index: int) -> str:
    return rule_at(birth_index, survival_index).canonical()


@dataclass(frozen=True)
class Landmark:
    name: str
    birth_mask: int
    survival_mask: int
    claim: str
    source: str
    # What the measured metrics must show. Qualitative claims from the literature, not thresholds
    # fitted after the fact: each is a range the sweep must land inside.
    expectations: dict[str, tuple[float, float]]

    @property
    def birth_index(self) -> int:
        return index_of(self.birth_mask)

    @property
    def survival_index(self) -> int:
        return index_of(self.survival_mask)

    @property
    def rule(self) -> str:
        return LifeLike.from_mask(self.birth_mask | self.survival_mask << 9).canonical()

    def verify(self) -> None:
        actual = canonical_at(self.birth_index, self.survival_index)
        if actual != self.rule:
            raise ValueError(
                f"landmark {self.name}: chart position ({self.birth_index}, "
                f"{self.survival_index}) is {actual}, not {self.rule}"
            )


# Labels are data: a wrong one is an edit here, not a patch (design §6.2).
LANDMARKS: tuple[Landmark, ...] = (
    Landmark(
        name="Life",
        birth_mask=8,  # B3
        survival_mask=12,  # S23
        claim="Class IV at this scale: activity stays well below the rebuild-every-step rules, "
        "damage survives, and the field keeps structure rather than boiling.",
        source="Gardner, Scientific American 223(4) (1970); Wolfram (1984).",
        expectations={
            "activity": (0.01, 0.45),
            "spatial_entropy": (0.1, 0.9),
            "damage_died_rate": (0.0, 0.99),
        },
    ),
    Landmark(
        name="HighLife",
        birth_mask=8 | 64,  # B36
        survival_mask=12,  # S23
        claim="Life plus the replicator: activity and entropy in Life's band, with damage "
        "surviving every seed sampled here.",
        source="Bell, 'HighLife', as summarised in Eppstein's cellular-automaton notes.",
        expectations={
            "activity": (0.01, 0.45),
            "damage_died_rate": (0.0, 0.99),
        },
    ),
    Landmark(
        name="Seeds",
        birth_mask=4,  # B2
        survival_mask=0,  # S
        claim="Explosive: no cell survives, so the grid is rebuilt from scratch every step.",
        source="Bays, 'Seeds' (1993), as catalogued on LifeWiki.",
        expectations={
            "activity": (0.25, 1.0),
            "spatial_entropy": (0.5, 1.0),
        },
    ),
    Landmark(
        name="Day & Night",
        birth_mask=8 | 64 | 128 | 256,  # B3678
        survival_mask=8 | 16 | 64 | 128 | 256,  # S34678
        claim="Self-complementary and quiet on this torus: soups rarely settle into a single "
        "still life, but activity stays low because large ordered regions persist.",
        source="Bell, 'Day & Night' (1997), LifeWiki.",
        expectations={
            "activity": (0.01, 0.45),
            "damage_died_rate": (0.0, 0.99),
        },
    ),
)


@dataclass(frozen=True)
class Window:
    """A square block of chart coordinates."""

    birth_start: int
    survival_start: int
    size: int

    @property
    def birth_stop(self) -> int:
        return self.birth_start + self.size

    @property
    def survival_stop(self) -> int:
        return self.survival_start + self.size


def window_for(landmark: Landmark, quadrant: int, offset: int = 8) -> Window:
    """A quadrant-sized window with the landmark inside, clamped to the chart."""
    span = CHART - quadrant
    birth_start = min(max(landmark.birth_index - offset, 0), span)
    survival_start = min(max(landmark.survival_index - offset, 0), span)
    return Window(birth_start, survival_start, quadrant)


def sample_windows(quadrant: int = 32, offset: int = 8) -> tuple[Window, ...]:
    return tuple(window_for(landmark, quadrant, offset) for landmark in LANDMARKS)


@dataclass(frozen=True)
class Cell:
    """One product cell: where it sits in the output tile and which rule it stands for."""

    x: int
    y: int
    birth_index: int
    survival_index: int

    @property
    def rule(self) -> str:
        return canonical_at(self.birth_index, self.survival_index)


def sample_layout(quadrant: int = 32, offset: int = 8) -> list[Cell]:
    """The sample as one square tile: four quadrants, one per landmark.

    Quadrant order matches ``LANDMARKS``; within a quadrant, x is the birth axis and y the survival
    axis, so the tile is itself a (coarser) chart of the same two variables.
    """
    windows = sample_windows(quadrant, offset)
    width = quadrant * 2
    cells: list[Cell] = []
    # Row-major over the output tile: the product header promises row-major, so `index == y * width
    # + x` must hold for every consumer, not just for the writers.
    for y in range(width):
        for x in range(width):
            quadrant_index = (y // quadrant) * 2 + (x // quadrant)
            window = windows[quadrant_index]
            cells.append(
                Cell(
                    x=x,
                    y=y,
                    birth_index=window.birth_start + (x % quadrant),
                    survival_index=window.survival_start + (y % quadrant),
                )
            )
    return cells


def landmark_cells(quadrant: int = 32, offset: int = 8) -> dict[str, Cell]:
    """Where each landmark sits inside the product tile."""
    windows = sample_windows(quadrant, offset)
    found: dict[str, Cell] = {}
    for index, (landmark, window) in enumerate(zip(LANDMARKS, windows, strict=True)):
        local_x = landmark.birth_index - window.birth_start
        local_y = landmark.survival_index - window.survival_start
        found[landmark.name] = Cell(
            x=(index % 2) * quadrant + local_x,
            y=(index // 2) * quadrant + local_y,
            birth_index=landmark.birth_index,
            survival_index=landmark.survival_index,
        )
    return found
