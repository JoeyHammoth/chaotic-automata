"""The differential harness (ADR 0002): engine against independent reference, bit-exact.

The engine is invoked as a subprocess (``ca-diff``) that writes the raw grid to stdout, so the two
sides exchange cells rather than summaries of them. Both sides are timed, so a regression on either
one is visible in the test output.

Local use, with a larger workload than CI:

    cargo build -p ca-diff --release
    CA_DIFF_BIN=target/release/ca-diff CA_DIFF_LATTICE=128 CA_DIFF_STEPS=40 pytest -m differential
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

from .reference import Grid
from .rules import LifeLike

REPO_ROOT = Path(__file__).resolve().parents[2]


class EngineUnavailable(RuntimeError):
    """The ca-diff binary has not been built."""


@dataclass(frozen=True)
class EngineRun:
    cells: bytes
    digest: str
    step_nanos: int
    rule: str
    mutated: bool


@dataclass(frozen=True)
class DifferentialResult:
    rule: str
    width: int
    height: int
    steps: int
    engine: EngineRun
    reference_cells: bytes
    reference_digest: str
    reference_nanos: int

    @property
    def agrees(self) -> bool:
        return self.engine.cells == self.reference_cells

    @property
    def first_divergence(self) -> tuple[int, int] | None:
        """The first differing cell as (x, y), or None when the grids match."""
        if self.agrees:
            return None
        for index, (engine_cell, reference_cell) in enumerate(
            zip(self.engine.cells, self.reference_cells, strict=True)
        ):
            if engine_cell != reference_cell:
                return index % self.width, index // self.width
        raise AssertionError("grids differ in length but not in content")

    def summary(self) -> str:
        engine_ms = self.engine.step_nanos / 1e6
        reference_ms = self.reference_nanos / 1e6
        verdict = "agree" if self.agrees else f"diverge at {self.first_divergence}"
        return (
            f"{self.rule} {self.width}x{self.height} {self.steps} steps: {verdict}; "
            f"engine {engine_ms:.1f} ms, reference {reference_ms:.1f} ms "
            f"({reference_ms / max(engine_ms, 0.001):.0f}x)"
        )


def find_binary(explicit: str | os.PathLike[str] | None = None) -> Path:
    """Locate the ca-diff binary, or raise so tests can skip with a useful message."""
    if explicit is not None:
        path = Path(explicit)
        if path.exists():
            return path
        raise EngineUnavailable(f"CA_DIFF_BIN points at {path}, which does not exist")

    env = os.environ.get("CA_DIFF_BIN")
    if env:
        path = Path(env)
        if path.exists():
            return path
        raise EngineUnavailable(f"CA_DIFF_BIN points at {path}, which does not exist")

    for candidate in (
        REPO_ROOT / "target" / "release" / "ca-diff.exe",
        REPO_ROOT / "target" / "release" / "ca-diff",
        REPO_ROOT / "target" / "debug" / "ca-diff.exe",
        REPO_ROOT / "target" / "debug" / "ca-diff",
    ):
        if candidate.exists():
            return candidate
    raise EngineUnavailable(
        "ca-diff is not built; run `cargo build -p ca-diff --release` or set CA_DIFF_BIN"
    )


def run_engine(
    rule: str,
    seed: int,
    steps: int,
    width: int,
    height: int,
    *,
    mutate: bool = False,
    binary: str | os.PathLike[str] | None = None,
) -> EngineRun:
    path = find_binary(binary)
    command = [
        str(path),
        "--rule",
        rule,
        "--seed",
        str(seed),
        "--steps",
        str(steps),
        "--width",
        str(width),
        "--height",
        str(height),
    ]
    if mutate:
        command.append("--mutate")

    completed = subprocess.run(command, capture_output=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError(
            f"ca-diff failed with {completed.returncode}: "
            f"{completed.stderr.decode(errors='replace')}"
        )

    metadata = json.loads(completed.stderr.decode())
    return EngineRun(
        cells=completed.stdout,
        digest=metadata["digest"],
        step_nanos=int(metadata["step_ns"]),
        rule=metadata["rule"],
        mutated=bool(metadata["mutated"]),
    )


def run_reference(
    rule: str, seed: int, steps: int, width: int, height: int
) -> tuple[bytes, str, int]:
    parsed = LifeLike.parse(rule)
    grid = Grid.from_soup(parsed, width, height, seed)
    started = time.perf_counter_ns()
    grid.step(steps)
    elapsed = time.perf_counter_ns() - started
    return grid.cells(), grid.digest(), elapsed


def compare(
    rule: str,
    seed: int,
    steps: int,
    width: int,
    height: int,
    *,
    mutate: bool = False,
    binary: str | os.PathLike[str] | None = None,
) -> DifferentialResult:
    engine = run_engine(rule, seed, steps, width, height, mutate=mutate, binary=binary)
    reference_cells, reference_digest, reference_nanos = run_reference(
        rule, seed, steps, width, height
    )
    return DifferentialResult(
        rule=rule,
        width=width,
        height=height,
        steps=steps,
        engine=engine,
        reference_cells=reference_cells,
        reference_digest=reference_digest,
        reference_nanos=reference_nanos,
    )
