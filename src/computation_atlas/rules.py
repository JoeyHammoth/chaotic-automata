"""Life-like rules, parsed exactly as the Rust engine parses them.

The pipeline and the engine must agree on what a rule *is* before they can agree on what it does, so
this module mirrors ``ca_core::Rule``: same grammar, same canonical form, same 18-bit mask.
"""

from __future__ import annotations

from dataclasses import dataclass


class RuleError(ValueError):
    """A rule string that cannot be parsed."""


@dataclass(frozen=True)
class LifeLike:
    """The neighbour counts that birth and that survive, as 9-bit masks."""

    birth: int
    survival: int

    @classmethod
    def parse(cls, text: str) -> LifeLike:
        trimmed = text.strip()
        if not trimmed:
            raise RuleError("rule is empty; expected B<digits>/S<digits>, for example B3/S23")
        parts = trimmed.split("/")
        if len(parts) != 2:
            raise RuleError(
                f"expected exactly one '/', found {len(parts) - 1} separators in '{trimmed}'"
            )
        return cls(_parse_set(parts[0], "B"), _parse_set(parts[1], "S"))

    @classmethod
    def life(cls) -> LifeLike:
        return cls.parse("B3/S23")

    @property
    def mask(self) -> int:
        """Birth in bits 0-8, survival in bits 9-17."""
        return self.birth | (self.survival << 9)

    @classmethod
    def from_mask(cls, mask: int) -> LifeLike:
        return cls(mask & 0x1FF, (mask >> 9) & 0x1FF)

    def canonical(self) -> str:
        return f"B{_digits(self.birth)}/S{_digits(self.survival)}"

    def next_state(self, alive: bool, neighbours: int) -> bool:
        mask = self.survival if alive else self.birth
        return bool(mask >> neighbours & 1)

    def __str__(self) -> str:  # pragma: no cover - convenience
        return self.canonical()


def _digits(mask: int) -> str:
    return "".join(str(count) for count in range(9) if mask >> count & 1)


def _parse_set(part: str, prefix: str) -> int:
    if not part:
        raise RuleError(f"missing '{prefix}' set")
    if part[0].upper() != prefix:
        raise RuleError(f"expected '{prefix}' at the start of '{part}', found '{part[0]}'")
    mask = 0
    for char in part[1:]:
        if not char.isdigit():
            raise RuleError(f"'{char}' is not a digit in '{part}'")
        count = int(char)
        if count > 8:
            raise RuleError(f"neighbour count {count} is out of range 0-8 in '{part}'")
        mask |= 1 << count
    return mask
