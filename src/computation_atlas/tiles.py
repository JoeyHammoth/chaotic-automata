"""The tile pyramid: the map pre-rendered at every resolution the viewer needs.

The page used to fetch 2.8 MB of layers before it could paint. Now it fetches a few 128 px
PNGs for the window it is showing, so the bytes paid are the bytes seen. The finest level is
one pixel per cell; each level above it is the same map at half the resolution, and the viewer
draws coarse levels first, so a first paint or a pan has something under it while the fine
tiles arrive.

Colour is part of the data, not the page: :func:`write_tiles` writes the palette into the
manifest and the site reads it back, so a figure and its legend cannot drift apart. The
undecided hatch is baked into the pixels here, which is why it costs nothing at every zoom.
"""

from __future__ import annotations

import hashlib
import json
import math
import shutil
import struct
import zlib
from pathlib import Path

from .product import read_labels, read_layer

TILE_PX = 128

CLASS_COLOURS: dict[str, tuple[int, int, int]] = {
    "static": (58, 74, 96),
    "periodic": (96, 160, 190),
    "ordered": (126, 186, 132),
    "complex": (240, 196, 92),
    "chaotic": (226, 106, 84),
    "undecided": (40, 44, 52),
}
HATCH_LIGHT = (96, 104, 118)
HATCH_DARK = (28, 31, 37)
HATCH_PERIOD = 8
HATCH_WIDTH = 2
RAMP: tuple[tuple[float, tuple[int, int, int]], ...] = (
    (0.0, (16, 20, 30)),
    (0.25, (46, 84, 122)),
    (0.5, (82, 156, 138)),
    (0.75, (226, 186, 84)),
    (1.0, (244, 236, 200)),
)
DISAGREEMENT_AGREE = (60, 64, 78)
DISAGREEMENT_DISAGREE = (240, 44, 38)

# The disagreement layer is a view over the same chart, so it is a colouring like any other.
COLOURINGS = (
    "class",
    "activity",
    "spatial_entropy",
    "compression",
    "damage_rate",
    "disagreement",
)


def palette_block() -> dict[str, object]:
    return {
        "classes": {name: list(colour) for name, colour in CLASS_COLOURS.items()},
        "ramp": [[at, list(colour)] for at, colour in RAMP],
        "hatch": {
            "light": list(HATCH_LIGHT),
            "dark": list(HATCH_DARK),
            "period": HATCH_PERIOD,
            "width": HATCH_WIDTH,
        },
        "disagreement": {
            "agree": list(DISAGREEMENT_AGREE),
            "disagree": list(DISAGREEMENT_DISAGREE),
        },
    }


def levels_for(width: int, tile_px: int = TILE_PX) -> int:
    """How many levels a chart of ``width`` cells has: one pixel per cell at the finest."""
    if width % tile_px != 0:
        raise ValueError(f"chart width {width} is not a multiple of the {tile_px} px tile")
    ratio = width // tile_px
    if ratio & (ratio - 1) != 0:
        raise ValueError(f"chart width {width} is not {tile_px} px times a power of two")
    return int(math.log2(ratio)) + 1


def supports_tiles(width: int, tile_px: int = TILE_PX) -> bool:
    """True when a chart of ``width`` cells divides into a power-of-two pyramid of tiles."""
    if width < tile_px or width % tile_px:
        return False
    ratio = width // tile_px
    return ratio & (ratio - 1) == 0


def is_hatch_pixel(x: int, y: int) -> bool:
    return (x + y) % HATCH_PERIOD < HATCH_WIDTH


def _round(value: float) -> int:
    # Math.round in the browser, not Python's banker's rounding: they must agree on every pixel.
    return int(value + 0.5)


def _mix(start: tuple[int, int, int], end: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    t = min(1.0, max(0.0, t))
    return (
        _round(start[0] + (end[0] - start[0]) * t),
        _round(start[1] + (end[1] - start[1]) * t),
        _round(start[2] + (end[2] - start[2]) * t),
    )


def ramp_colour(t: float) -> tuple[int, int, int]:
    t = min(1.0, max(0.0, t if math.isfinite(t) else 0.0))
    for (at, colour), (previous_at, previous) in zip(RAMP[1:], RAMP, strict=False):
        if t <= at:
            span = at - previous_at
            return _mix(previous, colour, 0.0 if span == 0 else (t - previous_at) / span)
    return RAMP[-1][1]


def cell_colour(
    *,
    metric: str,
    value: float,
    low: float,
    high: float,
    class_name: str,
    undecided: bool,
    disagreement: int,
    x: int,
    y: int,
) -> tuple[int, int, int]:
    if metric == "disagreement":
        return _mix(DISAGREEMENT_AGREE, DISAGREEMENT_DISAGREE, disagreement / 255)
    if undecided:
        # Undecided is a state, not a gap: hatch it whatever the layer.
        return HATCH_LIGHT if is_hatch_pixel(x, y) else HATCH_DARK
    if metric == "class":
        return CLASS_COLOURS.get(class_name, CLASS_COLOURS["static"])
    span = high - low
    return ramp_colour(0.0 if span == 0 else (value - low) / span)


def render_colouring(
    *,
    metric: str,
    width: int,
    height: int,
    values: list[float],
    low: float,
    high: float,
    labels: list[int],
    names: list[str],
) -> bytes:
    """RGBA at one pixel per cell."""
    out = bytearray(width * height * 4)
    for y in range(height):
        row = y * width
        for x in range(width):
            cell = row + x
            code = labels[cell * 3] if cell * 3 < len(labels) else 0
            class_name = names[code] if code < len(names) else "static"
            colour = cell_colour(
                metric=metric,
                value=values[cell],
                low=low,
                high=high,
                class_name=class_name,
                undecided=(labels[cell * 3 + 1] == 1) if cell * 3 + 1 < len(labels) else False,
                disagreement=labels[cell * 3 + 2] if cell * 3 + 2 < len(labels) else 0,
                x=x,
                y=y,
            )
            offset = cell * 4
            out[offset] = colour[0]
            out[offset + 1] = colour[1]
            out[offset + 2] = colour[2]
            out[offset + 3] = 255
    return bytes(out)


def downsample(rgba: bytes, width: int, height: int, factor: int) -> tuple[bytes, int, int]:
    """Box filter. A parent level is the average of the cells it covers, hatching included."""
    if factor == 1:
        return rgba, width, height
    if width % factor or height % factor:
        raise ValueError(f"{width}x{height} does not divide by {factor}")
    out_w = width // factor
    out_h = height // factor
    area = factor * factor
    out = bytearray(out_w * out_h * 4)
    for oy in range(out_h):
        for ox in range(out_w):
            red = green = blue = 0
            for dy in range(factor):
                start = ((oy * factor + dy) * width + ox * factor) * 4
                for dx in range(factor):
                    offset = start + dx * 4
                    red += rgba[offset]
                    green += rgba[offset + 1]
                    blue += rgba[offset + 2]
            target = (oy * out_w + ox) * 4
            out[target] = (red + area // 2) // area
            out[target + 1] = (green + area // 2) // area
            out[target + 2] = (blue + area // 2) // area
            out[target + 3] = 255
    return bytes(out), out_w, out_h


def encode_png(rgba: bytes, width: int, height: int) -> bytes:
    """8-bit RGBA PNG with no ancillary chunks, so the same pixels always give the same bytes."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return (
            struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
        )

    stride = width * 4
    raw = bytearray()
    for row in range(height):
        raw.append(0)  # filter: none
        raw.extend(rgba[row * stride : (row + 1) * stride])
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def write_tiles(
    product_dir: str | Path,
    manifest: dict,
    *,
    tile_px: int = TILE_PX,
) -> dict[str, object]:
    """Write ``tiles/<colouring>/<level>/<x>_<y>.png``; return the manifest blocks describing them.

    The version hashes the pixels, not the encoded files: zlib output differs between
    platforms and zlib versions, so a byte hash would make one picture look like two. The
    caller owns the manifest; this function renders, writes and reports.
    """
    product_dir = Path(product_dir)
    width, height = manifest["space"]["tile"]
    levels = levels_for(width, tile_px)
    names = list(manifest["classes"]["names"])

    _, labels = read_labels(product_dir / manifest["classes"]["path"])
    layers = {}
    for entry in manifest["layers"]:
        _, values = read_layer(product_dir / entry["path"])
        layers[entry["metric"]] = (values, float(entry["min"]), float(entry["max"]))

    tiles_dir = product_dir / "tiles"
    if tiles_dir.exists():
        shutil.rmtree(tiles_dir)

    rendered: dict[str, bytes] = {}
    for metric in COLOURINGS:
        if metric == "class":
            values, low, high = [0.0] * (width * height), 0.0, 1.0
        elif metric == "disagreement":
            values, low, high = [0.0] * (width * height), 0.0, 255.0
        elif metric in layers:
            values, low, high = layers[metric]
        else:
            continue
        full = render_colouring(
            metric=metric,
            width=width,
            height=height,
            values=values,
            low=low,
            high=high,
            labels=labels,
            names=names,
        )
        for level in range(levels):
            factor = 2 ** (levels - 1 - level)
            pixels, level_width, level_height = downsample(full, width, height, factor)
            side = level_width // tile_px
            for ty in range(side):
                for tx in range(side):
                    tile = _crop(pixels, level_width, tx * tile_px, ty * tile_px, tile_px)
                    relative = f"tiles/{metric}/{level}/{tx}_{ty}.png"
                    rendered[relative] = tile
                    target = product_dir / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(encode_png(tile, tile_px, tile_px))

    digest = hashlib.sha256()
    for relative in sorted(rendered):
        digest.update(relative.encode("utf-8"))
        digest.update(b"/")
        digest.update(rendered[relative])

    available = {"class", "disagreement", *layers}
    return {
        "palette": palette_block(),
        "tiles": {
            "size": tile_px,
            "levels": levels,
            "path": "tiles",
            "version": digest.hexdigest()[:12],
            "colourings": [metric for metric in COLOURINGS if metric in available],
            "count": len(rendered),
        },
    }


def _crop(pixels: bytes, width: int, left: int, top: int, size: int) -> bytes:
    out = bytearray(size * size * 4)
    for row in range(size):
        start = ((top + row) * width + left) * 4
        out[row * size * 4 : (row + 1) * size * 4] = pixels[start : start + size * 4]
    return bytes(out)


def main(argv: list[str] | None = None) -> int:
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="Render the tile pyramid for a product directory.")
    parser.add_argument(
        "--product", default=None, help="product directory (default: products/atlas)"
    )
    parsed = parser.parse_args(sys.argv[1:] if argv is None else argv)

    root = Path(__file__).resolve().parents[2]
    product_dir = Path(parsed.product) if parsed.product else root / "products" / "atlas"
    manifest_path = product_dir / "manifest.json"
    if not manifest_path.exists():
        print(f"{manifest_path} is missing; run a sweep first")
        return 1
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest.update(write_tiles(product_dir, manifest))
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    tiles = manifest["tiles"]
    print(
        f"wrote {tiles['count']} tiles over {tiles['levels']} levels "
        f"for {len(tiles['colourings'])} colourings; version {tiles['version']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
