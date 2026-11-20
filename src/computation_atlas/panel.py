"""The Inspector panel's product: one JSON document holding what the page is allowed to draw.

The analysis lives in :mod:`computation_atlas.inspector`; this module decides what a panel needs and
writes it with the seed that produced it, so a number on the page cannot come from a run nobody can
repeat. Fields travel as base64 of packed bits (row-major, low bit first, each row padded to a byte)
and complexities as one byte per cell, scaled by the window's peak; the layout is stated in the
document itself because a reader that has to guess an encoding is a reader that will guess wrong.

The filtered field is the domain *residue*: for a periodic domain, the cells the pattern does not
explain; for a region domain, the wall columns plus any violation. When there is no domain the
document says ``null`` rather than shipping a field that would invent structure.
"""

from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path

from .inspector import (
    CLAIMS,
    Domain,
    PhaseDomain,
    Rule1D,
    domain_tiling,
    elementary,
    filter_domain,
    from_number,
    infer_domain,
    infer_phase_domain,
    local_causal_states,
    spacetime,
    spacetime_from,
    track,
)

PANEL_VERSION = 1
DEFAULT_RULES = (18, 30, 36)
ENCODINGS = {
    "bits": "base64, row-major, low bit first, each row padded to a byte",
    "levels": "base64, one byte per cell, 255 is the peak local complexity of this window",
}


def pack_bits(rows: tuple[bytes, ...] | list[bytes]) -> str:
    """Pack binary rows into base64 bytes, eight cells per byte, low bit first."""
    if not rows:
        raise ValueError("rows is empty")
    stride = (len(rows[0]) + 7) // 8
    body = bytearray()
    for row in rows:
        chunk = bytearray(stride)
        for index, value in enumerate(row):
            if value:
                chunk[index >> 3] |= 1 << (index & 7)
        body.extend(chunk)
    return base64.b64encode(bytes(body)).decode("ascii")


def unpack_bits(encoded: str, width: int, height: int) -> list[bytes]:
    """The inverse of :func:`pack_bits`, for tests and for anyone checking a product by hand."""
    stride = (width + 7) // 8
    body = base64.b64decode(encoded)
    if len(body) != stride * height:
        raise ValueError(f"expected {stride * height} bytes, found {len(body)}")
    rows = []
    for row in range(height):
        chunk = body[row * stride : (row + 1) * stride]
        rows.append(bytes((chunk[index >> 3] >> (index & 7)) & 1 for index in range(width)))
    return rows


def pack_levels(rows: tuple[tuple[float, ...], ...] | list[list[float]]) -> str:
    """Quantise a complexity field to one byte per cell, scaled by its own peak."""
    peak = max((value for row in rows for value in row), default=0.0)
    if peak <= 0:
        peak = 1.0
    body = bytearray()
    for row in rows:
        for value in row:
            body.append(max(0, min(255, int(round(255 * value / peak)))))
    return base64.b64encode(bytes(body)).decode("ascii")


def damage_field(rule: Rule1D, rows: tuple[bytes, ...]) -> tuple[bytes, ...]:
    """Twin-replica difference: a second run from the same row with one cell flipped."""
    width = len(rows[0])
    initial = bytearray(rows[0])
    initial[width // 2] ^= 1
    twin = spacetime_from(rule, bytes(initial), len(rows) - 1)
    return tuple(
        bytes(a ^ b for a, b in zip(row, other, strict=True))
        for row, other in zip(rows, twin, strict=True)
    )


def filtered_field(
    rows: tuple[bytes, ...],
    domain: Domain | None,
    region: PhaseDomain | None,
) -> tuple[bytes, ...] | None:
    """What the domain does not explain: the rest of the row, or ``None`` for no domain."""
    if domain is not None:
        return filter_domain(rows, domain)
    if region is None:
        return None
    residue = []
    for row in rows:
        tiled = domain_tiling(row)
        walls = set(tiled.walls)
        width = len(row)
        marks = bytearray(width)
        for index in range(width):
            broken = tiled.phases[index] == index % 2 and row[index] != 0
            on_wall = index in walls or (index - 1) % width in walls
            marks[index] = 1 if broken or on_wall else 0
        residue.append(bytes(marks))
    return tuple(residue)


def _centre(shape: tuple[int, ...]) -> int:
    return round(sum(shape) / len(shape))


def _claim_payload(number: int) -> dict[str, object] | None:
    found = CLAIMS.get(number)
    if found is None:
        return None
    return {"text": found.text, "source": found.source, "verified": found.verified}


def _domain_payload(domain: Domain | None) -> dict[str, object] | None:
    if domain is None:
        return None
    return {
        "description": domain.describe(),
        "pattern": [None if value is None else int(value) for value in domain.pattern],
        "coverage": domain.coverage,
        "period": domain.period,
    }


def _region_payload(region: PhaseDomain | None) -> dict[str, object] | None:
    if region is None:
        return None
    return {
        "description": region.describe(),
        "walls_mean": region.walls_mean,
        "wall_fraction": region.wall_fraction,
        "rows": region.rows,
    }


def build(
    number: int,
    *,
    width: int = 128,
    steps: int = 96,
    seed: int = 11,
    settle: int = 8,
    radius: int = 1,
    min_cells: int = 2,
) -> dict[str, object]:
    """One rule's panel document. Same arguments, same bytes: the seed travels with the figures."""
    rule = elementary(number) if radius == 1 else from_number(number, radius)
    rows = spacetime(rule, width, steps, seed)
    observed = rows[settle:]
    domain = infer_domain(rows)
    region = infer_phase_domain(observed)
    residue = filtered_field(observed, domain, region)
    tracked = track(residue, min_cells=min_cells) if residue is not None else None
    states = local_causal_states(rows)

    return {
        "version": PANEL_VERSION,
        "rule": number,
        "width": width,
        "steps": steps,
        "seed": seed,
        "settle": settle,
        "radius": radius,
        "support": {
            "dimension": "1D binary",
            "radius": radius,
            "note": "1D binary radius 1-2 only; radius 3+ and 2D reconstruction are out of scope",
        },
        "claim": _claim_payload(number),
        "periodic": _domain_payload(domain),
        "region": _region_payload(region),
        "encodings": ENCODINGS,
        "fields": {
            "raw": pack_bits(observed),
            "filtered": None if residue is None else pack_bits(residue),
            "complexity": pack_levels(states.complexity[settle:]),
            "damage": pack_bits(damage_field(rule, observed)),
        },
        "tracks": []
        if tracked is None
        else [
            {
                "id": particle.ident,
                "start": particle.start,
                "end": particle.end,
                "lifetime": particle.lifetime,
                "velocity": particle.velocity,
                "period": None if particle.period is None else list(particle.period),
                "cells": particle.cells,
                "rows": [
                    [particle.start + offset, _centre(shape)]
                    for offset, shape in enumerate(particle.shapes)
                ],
            }
            for particle in tracked.particles
        ],
        "collisions": []
        if tracked is None
        else [
            {
                "time": event.time,
                "kind": event.kind,
                "inputs": list(event.inputs),
                "outputs": list(event.outputs),
            }
            for event in tracked.collisions
        ],
        "states": {
            "count": states.count,
            "past": states.past,
            "future": states.future,
            "undecided": states.undecided,
        },
    }


def build_document(
    rules: tuple[int, ...] = DEFAULT_RULES,
    *,
    width: int = 128,
    steps: int = 96,
    seed: int = 11,
    settle: int = 8,
) -> dict[str, object]:
    return {
        "version": PANEL_VERSION,
        "generator": "python -m computation_atlas.panel",
        "seed": seed,
        "width": width,
        "steps": steps,
        "settle": settle,
        "rules": [
            build(number, width=width, steps=steps, seed=seed, settle=settle) for number in rules
        ],
    }


def serialize(document: dict[str, object]) -> str:
    """The canonical text of a panel document: sorted keys, one-space indent, trailing newline.

    The writer and the staleness check both go through here, so the format lives in one place and a
    committed product can be compared against a rebuild without either side drifting.
    """
    return json.dumps(document, sort_keys=True, indent=1) + "\n"


def write_panel(
    out_dir: str | Path,
    rules: tuple[int, ...] = DEFAULT_RULES,
    *,
    width: int = 128,
    steps: int = 96,
    seed: int = 11,
    settle: int = 8,
) -> Path:
    document = build_document(rules, width=width, steps=steps, seed=seed, settle=settle)
    path = Path(out_dir) / "panel.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(serialize(document), encoding="utf-8", newline="\n")
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write the Inspector panel product.")
    parser.add_argument(
        "--out", default="products/inspector", help="directory to write panel.json into"
    )
    parser.add_argument("--rules", default=",".join(str(rule) for rule in DEFAULT_RULES))
    parser.add_argument("--width", type=int, default=128)
    parser.add_argument("--steps", type=int, default=96)
    parser.add_argument("--seed", type=int, default=11)
    parser.add_argument("--settle", type=int, default=8)
    args = parser.parse_args(argv)
    rules = tuple(int(part) for part in args.rules.split(",") if part.strip())
    path = write_panel(
        args.out, rules, width=args.width, steps=args.steps, seed=args.seed, settle=args.settle
    )
    print(path)
    return 0


if __name__ == "__main__":  # pragma: no cover - exercised by the pipeline, not by pytest
    raise SystemExit(main())
