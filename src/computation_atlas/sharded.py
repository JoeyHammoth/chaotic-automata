"""Resumable, sharded driver for the long sweep (issue #16).

The atlas sweep is the largest job in the pipeline: 262,144 rules, each measured on its own lattice.
The preview profile finishes in minutes; a profile with real budgets and several seeds runs for
hours. One ``ca-sweep`` invocation cannot survive being stopped, so this driver cuts the chart into
bands, gives each band its own process, its own JSONL file and a marker describing the finished
bytes, and re-runs on restart only the bands that are not provably complete.

Two properties the tests pin:

- **Band boundaries cannot change a number.** A rule is measured independently of every other rule,
  a band always holds whole rules (bands split only the survival axis), and aggregation walks the
  bands in plan order, so a product is identical whether it was computed in one process or two
  hundred.
- **Completion is checked, not assumed.** The marker records the plan fingerprint, the row count and
  the hash of the data file. A missing marker, a truncated file, a hash mismatch or a changed budget
  all mean "measure this band again"; only a flushed, renamed file is ever marked done.

Determinism has one boundary worth stating: the fingerprint covers the profile (budgets, seeds,
salt, layout) and the shard plan, not the engine binary. After changing engine code, pass
``--restart`` (or delete the work directory) rather than trusting bands measured by the old build.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from .metrics import RuleSummary
from .space import Window, chart_layout, sample_layout, sample_windows
from .sweep import (
    LATTICE,
    PIPELINE_VERSION,
    PROFILES,
    REPO_ROOT,
    Profile,
    SweepResult,
    build_products,
    find_binary,
    summarise,
)

SHARD_SCHEMA = 1
DEFAULT_SHARD_ROWS = 8

Progress = Callable[[str], None]


@dataclass(frozen=True)
class Band:
    """A rectangular block of chart coordinates: the unit of work and of resumption."""

    birth_start: int
    birth_count: int
    survival_start: int
    survival_count: int

    @property
    def cells(self) -> int:
        return self.birth_count * self.survival_count

    def rect(self) -> str:
        """The ``--window`` argument: birth start:count, survival start:count."""
        return f"{self.birth_start}:{self.birth_count}:{self.survival_start}:{self.survival_count}"


@dataclass
class ShardedResult:
    result: SweepResult
    bands: int
    ran: int
    skipped: int
    seconds: float


def windows_for(profile: Profile) -> tuple[Window, ...]:
    """The profile's windows, in the same order :func:`sweep.run_sweep` would sweep them."""
    if profile.layout == "chart":
        return (Window(0, 0, profile.quadrant),)
    return sample_windows(profile.quadrant, profile.offset)


def plan_shards(profile: Profile, shard_rows: int = DEFAULT_SHARD_ROWS) -> list[Band]:
    """Cut every window into horizontal bands of at most ``shard_rows`` survival rows.

    Bands split only the survival axis, so each (birth, survival) rule lies wholly inside one band:
    no rule is ever measured twice or assembled from two processes, which is what makes the result
    independent of where the cuts fall.
    """
    if shard_rows < 1:
        raise ValueError(f"shard_rows must be at least 1, got {shard_rows}")
    bands: list[Band] = []
    for window in windows_for(profile):
        offset = 0
        while offset < window.size:
            rows = min(shard_rows, window.size - offset)
            bands.append(
                Band(
                    birth_start=window.birth_start,
                    birth_count=window.size,
                    survival_start=window.survival_start + offset,
                    survival_count=rows,
                )
            )
            offset += rows
    return bands


def fingerprint(profile: Profile, shard_rows: int) -> str:
    """Everything that can change a measured number, hashed.

    A marker from another plan is stale even if it looks well-formed, so this is the first thing the
    resume check compares.
    """
    payload = {
        "schema": SHARD_SCHEMA,
        "pipeline_version": PIPELINE_VERSION,
        "profile": profile.name,
        "layout": profile.layout,
        "quadrant": profile.quadrant,
        "offset": profile.offset,
        "budgets": profile.budgets(),
        "seeds": list(profile.seeds),
        "salt": profile.salt,
        "lattice": LATTICE,
        "shard_rows": shard_rows,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def _paths(work: Path, index: int) -> tuple[Path, Path]:
    return work / f"shard-{index:05d}.jsonl", work / f"shard-{index:05d}.done.json"


def _digest(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
            size += len(block)
    return digest.hexdigest(), size


def _write_atomic(path: Path, data: bytes) -> None:
    partial = path.with_name(path.name + ".tmp")
    with partial.open("wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(partial, path)


def is_complete(work: Path, index: int, plan: str, rows: int) -> bool:
    """True only when a band's marker and data agree with this exact plan."""
    data_path, marker_path = _paths(work, index)
    try:
        marker = json.loads(marker_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    if (
        marker.get("schema") != SHARD_SCHEMA
        or marker.get("fingerprint") != plan
        or marker.get("rows") != rows
    ):
        return False
    try:
        digest, size = _digest(data_path)
    except OSError:
        return False
    return size == marker.get("bytes") and digest == marker.get("sha256")


def _run_band(
    profile: Profile,
    band: Band,
    index: int,
    work: Path,
    binary: Path,
    plan: str,
    rows: int,
) -> None:
    data_path, marker_path = _paths(work, index)
    partial = data_path.with_name(data_path.name + ".tmp")
    command = [
        str(binary),
        "--salt",
        str(profile.salt),
        "--threads",
        str(profile.threads),
        "--out",
        str(partial),
        "--lattice",
        str(LATTICE),
        "--warm",
        str(profile.warm),
        "--max-steps",
        str(profile.max_steps),
        "--period-cap",
        str(profile.period_cap),
        "--cadence",
        str(profile.cadence),
        "--frames",
        str(profile.frames),
    ]
    for seed in profile.seeds:
        command += ["--seed", str(seed)]
    command += ["--window", band.rect()]

    completed = subprocess.run(command, capture_output=True, check=False, text=True)
    if completed.returncode != 0:
        partial.unlink(missing_ok=True)
        raise RuntimeError(
            f"ca-sweep failed on window {band.rect()} ({completed.returncode}): "
            f"{completed.stderr.strip()}"
        )

    # Flush before the rename: the marker below must never describe bytes that only exist in the
    # page cache, because a power loss between the two would leave a complete-looking band.
    with partial.open("rb+") as stream:
        os.fsync(stream.fileno())
    os.replace(partial, data_path)

    digest, size = _digest(data_path)
    marker = {
        "schema": SHARD_SCHEMA,
        "fingerprint": plan,
        "band": band.rect(),
        "rows": rows,
        "bytes": size,
        "sha256": digest,
    }
    _write_atomic(marker_path, json.dumps(marker, sort_keys=True).encode("utf-8"))


def collect(work: Path, bands: list[Band], seeds: int) -> dict[tuple[int, int], RuleSummary]:
    """Summarise each rule from the band that holds it, in plan order.

    ``ca-sweep`` emits rows for one rule consecutively and in ``--seed`` order, so grouping runs
    without holding the whole sweep in memory. Every rule must show up with exactly one row per
    seed; anything else is a silently duplicated or lost band, which the products would otherwise
    average over.
    """
    summaries: dict[tuple[int, int], RuleSummary] = {}
    for index, _band in enumerate(bands):
        data_path, _ = _paths(work, index)
        key: tuple[int, int] | None = None
        bucket: list[dict[str, object]] = []
        with data_path.open(encoding="utf-8") as stream:
            for line in stream:
                if not line.strip():
                    continue
                row = json.loads(line)
                this = (int(row["bx"]), int(row["by"]))
                if this != key:
                    if key is not None:
                        summaries[key] = _summarise(key, bucket, seeds)
                    key = this
                    bucket = []
                bucket.append(row)
        if key is not None:
            summaries[key] = _summarise(key, bucket, seeds)
    return summaries


def _summarise(
    key: tuple[int, int], rows: list[dict[str, object]], seeds: int
) -> RuleSummary:
    if len(rows) != seeds:
        raise RuntimeError(
            f"rule {key} has {len(rows)} rows for {seeds} seeds: the shards do not agree"
        )
    return summarise(key, rows)


def run_sharded(
    profile: Profile,
    binary: str | os.PathLike[str] | None = None,
    work_dir: str | os.PathLike[str] | None = None,
    shard_rows: int = DEFAULT_SHARD_ROWS,
    restart: bool = False,
    progress: Progress = print,
) -> ShardedResult:
    """Run (or resume) a profile band by band and return the same result an unsharded run gives."""
    path = find_binary(binary)
    bands = plan_shards(profile, shard_rows)
    plan = fingerprint(profile, shard_rows)
    work = Path(work_dir) if work_dir else REPO_ROOT / ".scratch" / "shards" / profile.name
    work.mkdir(parents=True, exist_ok=True)
    if restart:
        for leftover in work.glob("shard-*"):
            leftover.unlink()

    started = time.monotonic()
    ran = 0
    skipped = 0
    measured = 0.0
    for index, band in enumerate(bands):
        rows = band.cells * len(profile.seeds)
        if is_complete(work, index, plan, rows):
            skipped += 1
            progress(f"[{index + 1}/{len(bands)}] {band.rect()} complete, skipping")
            continue
        began = time.monotonic()
        _run_band(profile, band, index, work, path, plan, rows)
        elapsed = time.monotonic() - began
        ran += 1
        measured += elapsed
        remaining = (len(bands) - index - 1) * (measured / ran)
        progress(
            f"[{index + 1}/{len(bands)}] {band.rect()} {rows} rows in {elapsed:.1f}s, "
            f"~{remaining / 60:.0f} min left"
        )

    if profile.layout == "chart":
        cells = chart_layout(profile.quadrant)
    else:
        cells = sample_layout(profile.quadrant, profile.offset)
    unique = {(cell.birth_index, cell.survival_index) for cell in cells}
    summaries = collect(work, bands, len(profile.seeds))
    missing = unique - summaries.keys()
    if missing:
        first = min(missing)
        raise RuntimeError(
            f"{len(missing)} rules are missing from the shards, starting at {first}: "
            "the plan does not cover the chart"
        )

    return ShardedResult(
        result=SweepResult(
            profile=profile,
            cells=cells,
            summaries=summaries,
            unique_rules=len(unique),
            duplicate_cells=len(cells) - len(unique),
            binary=str(path),
        ),
        bands=len(bands),
        ran=ran,
        skipped=skipped,
        seconds=time.monotonic() - started,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run a sweep profile in resumable shards, then write its products."
    )
    parser.add_argument("--profile", choices=sorted(PROFILES), default="atlas")
    parser.add_argument(
        "--work", default=None, help="shard directory (default: .scratch/shards/<profile>)"
    )
    parser.add_argument("--out", default=None, help="product directory; omit to only measure")
    parser.add_argument("--shard-rows", type=int, default=DEFAULT_SHARD_ROWS)
    parser.add_argument("--binary", default=None)
    parser.add_argument("--restart", action="store_true", help="discard existing shards first")
    parsed = parser.parse_args(argv)

    profile = PROFILES[parsed.profile]
    sharded = run_sharded(
        profile,
        binary=parsed.binary,
        work_dir=parsed.work,
        shard_rows=parsed.shard_rows,
        restart=parsed.restart,
    )
    print(
        f"{profile.name}: {sharded.result.unique_rules} unique rules in {sharded.bands} bands "
        f"({sharded.ran} run, {sharded.skipped} already complete) in {sharded.seconds / 60:.1f} min"
    )
    if parsed.out:
        manifest = build_products(sharded.result, parsed.out)
        products = manifest.get("products") or manifest.get("layers") or []
        print(f"wrote {parsed.out} ({len(products)} products)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
