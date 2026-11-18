"""The sample sweep: run ``ca-sweep`` over the quadrants, aggregate, write products and a manifest.

Profiles exist so the same code can pin a golden file in CI (small, seconds), produce the sample
product (minutes) and the full atlas (hours). Nothing here decides a budget: the profile does, and
profile is written into the manifest so "undecided" is always relative to stated caps.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

from .metrics import (
    CLASS_CODES,
    METRICS,
    Interval,
    RuleSummary,
    bootstrap_interval,
    classify,
    indicator_disagreement,
)
from .product import HEADER_BYTES, encode_labels, encode_layer, encode_product, sha256_of
from .space import (
    LANDMARKS,
    Cell,
    Window,
    canonical_at,
    chart_layout,
    landmark_cells,
    sample_layout,
    sample_windows,
)
from .tiles import supports_tiles, write_tiles

REPO_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_VERSION = "0.1.0"
LATTICE = 64


@dataclass(frozen=True)
class Profile:
    name: str
    quadrant: int
    warm: int
    max_steps: int
    period_cap: int
    seeds: tuple[int, ...]
    salt: int = 1
    offset: int = 8
    cadence: int = 8
    frames: int = 8
    # "landmarks" lays out four quadrants around the landmark rules; "chart" covers the whole chart.
    layout: str = "landmarks"
    # When set, write one fp16 file per metric instead of a single f32 metrics file.
    layers: tuple[str, ...] = ()
    threads: int = 1

    def budgets(self) -> dict[str, object]:
        return {
            "lattice": [LATTICE, LATTICE],
            "warm": self.warm,
            "max_steps": self.max_steps,
            "period_cap": self.period_cap,
            "cadence": self.cadence,
            "frames": self.frames,
            "density": 30,
        }


# One budget set for every product that claims a measured number, so a cell in the map and a cell
# in the sample product differ in extent, never in what was measured. Six seeds is the point below
# which a bootstrap interval is a statement about the seeds, not about the rule.
FULL_WARM = 24
FULL_STEPS = 300
FULL_PERIOD_CAP = 300
FULL_SEEDS = (11, 23, 37, 53, 71, 97)

PROFILES: dict[str, Profile] = {
    # Small enough for CI on every pull request: pins the pipeline, not the science.
    "golden": Profile(
        name="golden",
        quadrant=4,
        warm=8,
        max_steps=40,
        period_cap=120,
        seeds=(11, 23),
    ),
    # The atlas product: the whole 512x512 chart, cheap budgets, layers for the map.
    "atlas": Profile(
        name="atlas",
        quadrant=512,
        warm=4,
        max_steps=40,
        period_cap=40,
        seeds=(11,),
        offset=0,
        layout="chart",
        layers=("activity", "spatial_entropy", "compression", "damage_rate"),
        threads=16,
    ),
    # The full atlas: every rule of the 512x512 chart at the sample's budgets. Same measurement,
    # all of it: this is the profile the long, resumable sweep runs (see sharded.py).
    "atlas-full": Profile(
        name="atlas-full",
        quadrant=512,
        warm=FULL_WARM,
        max_steps=FULL_STEPS,
        period_cap=FULL_PERIOD_CAP,
        seeds=FULL_SEEDS,
        offset=0,
        layout="chart",
        layers=("activity", "spatial_entropy", "compression", "damage_rate"),
        threads=16,
    ),
    # The sample product: four 32x32 quadrants, one around each landmark.
    "sample": Profile(
        name="sample",
        quadrant=32,
        warm=FULL_WARM,
        max_steps=FULL_STEPS,
        period_cap=FULL_PERIOD_CAP,
        seeds=FULL_SEEDS,
    ),
}


class SweepUnavailable(RuntimeError):
    """The ca-sweep binary has not been built."""


def find_binary(explicit: str | os.PathLike[str] | None = None) -> Path:
    candidates: list[Path] = []
    if explicit is not None:
        candidates.append(Path(explicit))
    env = os.environ.get("CA_SWEEP_BIN")
    if env:
        candidates.append(Path(env))
    for name in ("ca-sweep.exe", "ca-sweep"):
        candidates.append(REPO_ROOT / "target" / "release" / name)
        candidates.append(REPO_ROOT / "target" / "debug" / name)
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise SweepUnavailable(
        "ca-sweep is not built; run `cargo build -p ca-sweep --release` or set CA_SWEEP_BIN"
    )


@dataclass
class SweepResult:
    profile: Profile
    cells: list[Cell]
    summaries: dict[tuple[int, int], RuleSummary] = field(default_factory=dict)
    unique_rules: int = 0
    duplicate_cells: int = 0
    binary: str = ""


def run_sweep(profile: Profile, binary: str | os.PathLike[str] | None = None) -> SweepResult:
    path = find_binary(binary)
    if profile.layout == "chart":
        cells = chart_layout(profile.quadrant)
        windows = (Window(0, 0, profile.quadrant),)
    else:
        cells = sample_layout(profile.quadrant, profile.offset)
        windows = sample_windows(profile.quadrant, profile.offset)
    unique: dict[tuple[int, int], None] = {}
    for cell in cells:
        unique.setdefault((cell.birth_index, cell.survival_index), None)

    scratch = REPO_ROOT / ".scratch"
    scratch.mkdir(exist_ok=True)
    rows_path = scratch / f"sweep-{profile.name}.jsonl"
    command = [
        str(path),
        "--salt",
        str(profile.salt),
        "--threads",
        str(profile.threads),
        "--out",
        str(rows_path),
    ]
    for flag, value in (
        ("--lattice", LATTICE),
        ("--warm", profile.warm),
        ("--max-steps", profile.max_steps),
        ("--period-cap", profile.period_cap),
        ("--cadence", profile.cadence),
        ("--frames", profile.frames),
    ):
        command += [flag, str(value)]
    for seed in profile.seeds:
        command += ["--seed", str(seed)]
    for window in windows:
        command += [
            "--window",
            f"{window.birth_start}:{window.size}:{window.survival_start}:{window.size}",
        ]

    completed = subprocess.run(command, capture_output=True, check=False, text=True)
    if completed.returncode != 0:
        raise RuntimeError(f"ca-sweep failed ({completed.returncode}): {completed.stderr.strip()}")

    rows: dict[tuple[int, int], list[dict[str, object]]] = {key: [] for key in unique}
    with rows_path.open(encoding="utf-8") as stream:
        for line in stream:
            if not line.strip():
                continue
            row = json.loads(line)
            rows[(int(row["bx"]), int(row["by"]))].append(row)
    rows_path.unlink(missing_ok=True)

    result = SweepResult(profile=profile, cells=cells, binary=str(path))
    result.summaries = {key: summarise(key, rule_rows) for key, rule_rows in sorted(rows.items())}
    result.unique_rules = len(unique)
    result.duplicate_cells = len(cells) - len(unique)
    return result


def summarise(index: tuple[int, int], rows: list[dict[str, object]]) -> RuleSummary:
    seeds = len(rows)
    per_seed: dict[str, list[float]] = {name: [] for name in METRICS}

    for row in rows:
        per_seed["activity"].append(float(row["activity"]))
        per_seed["spatial_entropy"].append(float(row["spatial_entropy"]))
        per_seed["temporal_entropy"].append(float(row["temporal_entropy"]))
        per_seed["compression"].append(float(row["compression"]))
        per_seed["damage_rate"].append(float(row["damage_rate"]))
        per_seed["damage_died_rate"].append(1.0 if row["damage_died"] else 0.0)
        per_seed["population"].append(float(row["population"]))
        per_seed["transient"].append(float(row["transient"]))
        per_seed["period"].append(math.nan if row["period"] is None else float(row["period"]))
        per_seed["lambda"].append(float(row["lambda"]))

    resolved = [row for row in rows if row["period"] is not None]
    undecided_mass = 1.0 - len(resolved) / seeds if seeds else 1.0
    per_seed["undecided_mass"] = [undecided_mass] * seeds
    per_seed["resolved_mass"] = [1.0 - undecided_mass] * seeds

    rng_seed = index[0] * 512 + index[1]
    intervals: dict[str, Interval] = {}
    for name, values in per_seed.items():
        if name == "period":
            defined = [value for value in values if not math.isnan(value)]
            intervals[name] = (
                bootstrap_interval(defined, resamples=200, seed=rng_seed)
                if defined
                else Interval(math.nan, math.nan, math.nan)
            )
        else:
            intervals[name] = bootstrap_interval(values, resamples=200, seed=rng_seed)

    class_name = classify(
        activity=intervals["activity"].mean,
        spatial_entropy=intervals["spatial_entropy"].mean,
        damage_died_rate=intervals["damage_died_rate"].mean,
        undecided_mass=undecided_mass,
        period=None if math.isnan(intervals["period"].mean) else intervals["period"].mean,
    )
    return RuleSummary(
        rule=canonical_at(*index),
        intervals=intervals,
        undecided_mass=undecided_mass,
        class_name=class_name,
    )


def _git_sha() -> str:
    try:
        completed = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, capture_output=True, text=True, check=True
        )
        return completed.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"


def build_products(result: SweepResult, out_dir: str | Path) -> dict[str, object]:
    """Write ``metrics.bin``, ``classes.bin``, ``rules.json`` and ``manifest.json``."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    profile = result.profile
    if profile.layers:
        return _build_layers(result, out)
    quadrant = profile.quadrant
    width = height = quadrant * 2

    channel_count = len(METRICS) * 3
    values: list[list[float]] = []
    labels: list[int] = []
    for cell in result.cells:
        summary = result.summaries[(cell.birth_index, cell.survival_index)]
        row: list[float] = []
        for name in METRICS:
            interval = summary.intervals[name]
            row.extend([interval.mean, interval.low, interval.high])
        values.append(row)
        labels.extend([summary.code, 1 if summary.undecided_mass == 0.0 else 0])

    metrics_bytes = encode_product(
        values,
        channels=channel_count,
        width=width,
        height=height,
        has_nan=any(math.isnan(value) for row in values for value in row),
    )
    classes_bytes = encode_labels(labels, channels=2, width=width, height=height)

    class_counts = {name: 0 for name in CLASS_CODES}
    for code in labels[0::2]:
        class_counts[list(CLASS_CODES)[code]] += 1

    (out / "metrics.bin").write_bytes(metrics_bytes)
    (out / "classes.bin").write_bytes(classes_bytes)

    rules = [
        {
            "x": cell.x,
            "y": cell.y,
            "birth_index": cell.birth_index,
            "survival_index": cell.survival_index,
            "rule": cell.rule,
        }
        for cell in result.cells
    ]
    rules_bytes = json.dumps(rules).encode("utf-8")
    (out / "rules.json").write_bytes(rules_bytes)

    manifest = {
        "schema": 1,
        "pipeline_version": PIPELINE_VERSION,
        "git_sha": _git_sha(),
        "profile": profile.name,
        "toolchain": {
            "python": sys.version.split()[0],
            "sweep_binary": os.path.basename(result.binary),
        },
        "space": {
            "family": "life-like",
            "quadrant": [quadrant, quadrant],
            "tile": [width, height],
            "layout": "four quadrants, one per landmark, in LANDMARKS order",
            "unique_rules": result.unique_rules,
            "duplicate_cells": result.duplicate_cells,
            "windows": [
                {
                    "birth_start": window.birth_start,
                    "survival_start": window.survival_start,
                    "size": window.size,
                }
                for window in sample_windows(quadrant, profile.offset)
            ],
            "landmarks": [
                {
                    "name": landmark.name,
                    "rule": landmark.rule,
                    "claim": landmark.claim,
                    "source": landmark.source,
                    "expectations": {
                        metric: [low, high] for metric, (low, high) in landmark.expectations.items()
                    },
                }
                for landmark in LANDMARKS
            ],
            "landmark_cells": {
                name: {"x": cell.x, "y": cell.y}
                for name, cell in landmark_cells(quadrant, profile.offset).items()
            },
        },
        "seeds": list(profile.seeds),
        "budgets": profile.budgets(),
        "channels": [f"{name}:{stat}" for name in METRICS for stat in ("mean", "low", "high")],
        "classes": list(CLASS_CODES),
        "class_counts": class_counts,
        "products": [
            {
                "path": "metrics.bin",
                "sha256": sha256_of(metrics_bytes),
                "bytes": len(metrics_bytes),
            },
            {
                "path": "classes.bin",
                "sha256": sha256_of(classes_bytes),
                "bytes": len(classes_bytes),
            },
            {
                "path": "rules.json",
                "sha256": sha256_of(rules_bytes),
                "bytes": len(rules_bytes),
            },
        ],
        "header_bytes": HEADER_BYTES,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def _build_layers(result: SweepResult, out: Path) -> dict[str, object]:
    """The atlas shape: one fp16 file per colouring plus a u8 class/disagreement file."""
    profile = result.profile
    width = height = profile.quadrant
    keys = [(cell.birth_index, cell.survival_index) for cell in result.cells]
    summaries = [result.summaries[key] for key in keys]

    layer_files = []
    for metric in profile.layers:
        raw = [summary.intervals[metric].mean for summary in summaries]
        finite = [value for value in raw if not math.isnan(value)]
        low = min(finite) if finite else 0.0
        high = max(finite) if finite else 1.0
        values = [0.0 if math.isnan(value) else value for value in raw]
        data = encode_layer(values, width=width, height=height)
        path = f"{metric}.bin"
        (out / path).write_bytes(data)
        layer_files.append(
            {
                "metric": metric,
                "path": path,
                "sha256": sha256_of(data),
                "bytes": len(data),
                "min": low,
                "max": high,
            }
        )

    labels: list[int] = []
    for summary in summaries:
        disagreement = indicator_disagreement(
            spatial_entropy=summary.intervals["spatial_entropy"].mean,
            damage_died_rate=summary.intervals["damage_died_rate"].mean,
            period=(
                None
                if math.isnan(summary.intervals["period"].mean)
                else summary.intervals["period"].mean
            ),
        )
        labels.extend(
            [
                summary.code,
                1 if summary.undecided_mass > 0.0 else 0,
                round(disagreement * 255),
            ]
        )
    classes_data = encode_labels(labels, channels=3, width=width, height=height)
    (out / "classes.bin").write_bytes(classes_data)

    class_counts = {name: 0 for name in CLASS_CODES}
    for code in labels[0::3]:
        class_counts[list(CLASS_CODES)[code]] += 1

    manifest = {
        "schema": 1,
        "kind": "layers",
        "pipeline_version": PIPELINE_VERSION,
        "git_sha": _git_sha(),
        "profile": profile.name,
        "toolchain": {
            "python": sys.version.split()[0],
            "sweep_binary": os.path.basename(result.binary),
        },
        "space": {
            "family": "life-like",
            "tile": [width, height],
            "axes": {"x": "birth mask (Gray)", "y": "survival mask (Gray)"},
            "unique_rules": result.unique_rules,
            "landmarks": [
                {
                    "name": landmark.name,
                    "rule": landmark.rule,
                    "birth_index": landmark.birth_index,
                    "survival_index": landmark.survival_index,
                    "claim": landmark.claim,
                }
                for landmark in LANDMARKS
            ],
        },
        "seeds": list(profile.seeds),
        "budgets": profile.budgets(),
        "layers": layer_files,
        "classes": {
            "path": "classes.bin",
            "sha256": sha256_of(classes_data),
            "bytes": len(classes_data),
            "channels": ["class", "undecided", "disagreement"],
            "names": list(CLASS_CODES),
            "counts": class_counts,
        },
        "header_bytes": HEADER_BYTES,
    }
    # Tiles are rendered from the layers just written, in the same run: one product,
    # one palette, one set of bytes, so the map cannot come from a different sweep.
    if supports_tiles(width):
        manifest.update(write_tiles(out, manifest))
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def golden_payload(result: SweepResult) -> dict[str, object]:
    """A committed artefact that pins the pipeline: rounded, NaN-free, exact bytes."""
    rules: dict[str, dict[str, float | None]] = {}
    for key in sorted(result.summaries):
        summary = result.summaries[key]
        rules[summary.rule] = {
            name: (None if math.isnan(interval.mean) else round(interval.mean, 6))
            for name, interval in summary.intervals.items()
        }
    return {
        "profile": result.profile.name,
        "budgets": result.profile.budgets(),
        "seeds": list(result.profile.seeds),
        "unique_rules": result.unique_rules,
        "rules": rules,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run a sweep profile.")
    parser.add_argument("--profile", choices=sorted(PROFILES), default="golden")
    parser.add_argument("--out", default=None, help="output directory")
    parser.add_argument("--binary", default=None)
    parser.add_argument("--golden", action="store_true", help="write the golden JSON, not products")
    parsed = parser.parse_args(sys.argv[1:] if argv is None else argv)

    profile = PROFILES[parsed.profile]
    result = run_sweep(profile, parsed.binary)
    print(
        f"{profile.name}: {result.unique_rules} unique rules "
        f"({result.duplicate_cells} duplicate cells), {len(profile.seeds)} seeds"
    )

    out = Path(parsed.out) if parsed.out else REPO_ROOT / "products" / profile.name
    if parsed.golden:
        out.mkdir(parents=True, exist_ok=True)
        target = out / "sample_profile.json"
        payload = json.dumps(golden_payload(result), indent=2, sort_keys=True) + "\n"
        target.write_text(payload, encoding="utf-8")
        print(f"wrote {target}")
    else:
        manifest = build_products(result, out)
        products = manifest.get("products") or manifest.get("layers") or []
        print(f"wrote {out} ({len(products)} products)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
