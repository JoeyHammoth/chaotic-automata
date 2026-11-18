"""The independent Python reference stepper (ADR 0002).

Deliberately naive: one byte per cell, eight neighbour reads, no bit tricks. It is not here for
speed; it is here to disagree with the optimised engine when the optimised engine is wrong. The
pipeline imports it too, so it is a real implementation rather than a test fixture.
"""

from __future__ import annotations

import hashlib

from .rules import LifeLike


def soup(width: int, height: int, seed: int, density_percent: int = 30) -> bytes:
    """xorshift32 soup, identical to ``ca_core::seed::soup``."""
    cells = bytearray(width * height)
    state = seed & 0xFFFFFFFF
    for index in range(len(cells)):
        x = state
        x ^= (x << 13) & 0xFFFFFFFF
        x ^= x >> 17
        x ^= (x << 5) & 0xFFFFFFFF
        state = x & 0xFFFFFFFF
        cells[index] = 1 if state % 100 < density_percent else 0
    return bytes(cells)


class Grid:
    """A toroidal Life-like grid, stepped the obvious way."""

    def __init__(self, rule: LifeLike, width: int, height: int, cells: bytes) -> None:
        if width <= 0 or height <= 0:
            raise ValueError("grid must be at least 1x1")
        if len(cells) != width * height:
            raise ValueError(f"expected {width * height} cells, found {len(cells)}")
        self.rule = rule
        self.width = width
        self.height = height
        self._cells = bytearray(cells)

    @classmethod
    def from_soup(
        cls,
        rule: LifeLike,
        width: int,
        height: int,
        seed: int,
        density_percent: int = 30,
    ) -> Grid:
        return cls(rule, width, height, soup(width, height, seed, density_percent))

    def cells(self) -> bytes:
        return bytes(self._cells)

    def digest(self) -> str:
        return hashlib.sha256(self.cells()).hexdigest()

    def population(self) -> int:
        return sum(self._cells)

    def step(self, steps: int = 1) -> None:
        width, height = self.width, self.height
        cells = self._cells
        rule = self.rule
        for _ in range(steps):
            nxt = bytearray(width * height)
            for y in range(height):
                up = (y - 1) % height
                down = (y + 1) % height
                for x in range(width):
                    left = (x - 1) % width
                    right = (x + 1) % width
                    neighbours = (
                        cells[up * width + left]
                        + cells[up * width + x]
                        + cells[up * width + right]
                        + cells[y * width + left]
                        + cells[y * width + right]
                        + cells[down * width + left]
                        + cells[down * width + x]
                        + cells[down * width + right]
                    )
                    alive = cells[y * width + x] == 1
                    nxt[y * width + x] = 1 if rule.next_state(alive, neighbours) else 0
            cells = nxt
        self._cells = cells
