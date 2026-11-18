"""The tile pyramid: pre-rendered levels, deterministic PNGs, and a gate on the committed bytes."""

from __future__ import annotations

import hashlib
import json
import shutil
import struct
import zlib
from pathlib import Path

import pytest

from computation_atlas.product import encode_labels, encode_layer
from computation_atlas.tiles import (
    COLOURINGS,
    HATCH_LIGHT,
    TILE_PX,
    downsample,
    encode_png,
    is_hatch_pixel,
    levels_for,
    palette_block,
    ramp_colour,
    write_tiles,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
NAMES = ["static", "periodic", "ordered", "complex", "chaotic", "undecided"]


def decode_png(data: bytes) -> tuple[int, int, bytes]:
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    offset = 8
    idat = b""
    width = height = 0
    kinds = []
    while offset < len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        kind = data[offset + 4 : offset + 8]
        payload = data[offset + 8 : offset + 8 + length]
        kinds.append(kind)
        if kind == b"IHDR":
            width, height, depth, colour_type = struct.unpack(">IIBB", payload[:10])
            assert (depth, colour_type) == (8, 6)
        elif kind == b"IDAT":
            idat += payload
        offset += 12 + length
    assert kinds[-1] == b"IEND"
    raw = zlib.decompress(idat)
    stride = width * 4
    rows = []
    for row in range(height):
        start = row * (stride + 1)
        assert raw[start] == 0, "rows use the no-filter encoding"
        rows.append(raw[start + 1 : start + 1 + stride])
    return width, height, b"".join(rows)


def pixel(rgba: bytes, width: int, x: int, y: int) -> tuple[int, int, int]:
    offset = (y * width + x) * 4
    return rgba[offset], rgba[offset + 1], rgba[offset + 2]


def build_product(root: Path, width: int = 256) -> dict:
    cells = width * width
    # One undecided cell, one periodic cell, one maximum disagreement, everything else flat.
    labels: list[int] = []
    for cell in range(cells):
        code = 1 if cell == 1 else 0
        undecided = 1 if cell == 0 else 0
        disagreement = 255 if cell == width else 0
        labels.extend([code, undecided, disagreement])
    (root / "classes.bin").write_bytes(encode_labels(labels, channels=3, width=width, height=width))
    values = [0.5] * cells
    (root / "activity.bin").write_bytes(encode_layer(values, width=width, height=width))
    manifest = {
        "space": {"tile": [width, width]},
        "layers": [
            {"metric": "activity", "path": "activity.bin", "min": 0.0, "max": 1.0},
        ],
        "classes": {"path": "classes.bin", "names": NAMES},
    }
    return manifest


def test_levels_follow_the_chart_size() -> None:
    assert levels_for(128) == 1
    assert levels_for(256) == 2
    assert levels_for(512) == 3
    with pytest.raises(ValueError):
        levels_for(384)
    with pytest.raises(ValueError):
        levels_for(64)


def test_png_roundtrip_is_exact_and_deterministic() -> None:
    rgba = bytes(
        [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 9, 9, 255, 1, 2, 3, 255, 4, 5, 6, 255]
    )
    first = encode_png(rgba, 3, 2)
    assert first == encode_png(rgba, 3, 2)
    width, height, decoded = decode_png(first)
    assert (width, height) == (3, 2)
    assert decoded == rgba


def test_downsample_averages_the_block() -> None:
    # Two pixels: black and white. One downsample step is the mean, rounded like Math.round.
    rgba = bytes([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255])
    out, width, height = downsample(rgba, 2, 2, 2)
    assert (width, height) == (1, 1)
    assert out == bytes([128, 128, 128, 255])


def test_write_tiles_covers_every_level_and_colouring(tmp_path: Path) -> None:
    root = tmp_path / "product"
    root.mkdir()
    manifest = build_product(root)
    blocks = write_tiles(root, manifest)

    tiles = blocks["tiles"]
    assert tiles["levels"] == 2
    assert tiles["colourings"] == [
        metric for metric in COLOURINGS if metric in {"class", "activity", "disagreement"}
    ]
    assert tiles["count"] == 3 * (1 + 4)
    assert tiles["bytes"] == sum(path.stat().st_size for path in (root / "tiles").rglob("*.png"))
    assert len(str(tiles["version"])) == 12

    class_root = root / "tiles" / "class"
    assert sorted(path.name for path in (class_root / "0").iterdir()) == ["0_0.png"]
    assert len(list((class_root / "1").iterdir())) == 4

    width, height, rgba = decode_png((class_root / "1" / "0_0.png").read_bytes())
    assert (width, height) == (TILE_PX, TILE_PX)
    # Cell (0, 0) is undecided, so it is hatched in place of the class colour.
    assert pixel(rgba, width, 0, 0) == HATCH_LIGHT
    assert pixel(rgba, width, 2, 2) == tuple(palette_block()["classes"]["static"])
    assert not is_hatch_pixel(2, 2)
    # Cell (1, 0) is periodic, so it takes the periodic class colour.
    assert pixel(rgba, width, 1, 0) == tuple(palette_block()["classes"]["periodic"])

    disagreement_png = (root / "tiles" / "disagreement" / "1" / "0_0.png").read_bytes()
    _, _, disagreement = decode_png(disagreement_png)
    # The cell at (0, 1) carries maximum disagreement, so it takes the far end of the scale.
    assert pixel(disagreement, TILE_PX, 0, 1) == tuple(palette_block()["disagreement"]["disagree"])

    # The parent level is the mean of the native pixels it covers, hatching included.
    covered = [pixel(rgba, width, x, y) for y in range(2) for x in range(2)]
    expected = tuple((sum(channel) + 2) // 4 for channel in zip(*covered, strict=False))
    coarse_width, coarse_height, coarse = decode_png((class_root / "0" / "0_0.png").read_bytes())
    assert (coarse_width, coarse_height) == (TILE_PX, TILE_PX)
    assert pixel(coarse, coarse_width, 0, 0) == expected


def test_ramp_clamps_and_hits_its_stops() -> None:
    stops = palette_block()["ramp"]
    assert ramp_colour(-1) == tuple(stops[0][1])
    assert ramp_colour(2) == tuple(stops[-1][1])
    assert ramp_colour(0.5) == (82, 156, 138)


@pytest.mark.skipif(
    not (REPO_ROOT / "products" / "atlas" / "tiles").exists(),
    reason="the committed atlas product has no tiles",
)
def test_committed_tiles_match_the_committed_layers(tmp_path: Path) -> None:
    committed = REPO_ROOT / "products" / "atlas"
    manifest = json.loads((committed / "manifest.json").read_text(encoding="utf-8"))

    copy = tmp_path / "atlas"
    copy.mkdir()
    shutil.copy2(committed / "manifest.json", copy / "manifest.json")
    for name in ["classes.bin", *(entry["path"] for entry in manifest["layers"])]:
        shutil.copy2(committed / name, copy / name)

    rebuilt = write_tiles(copy, manifest)
    assert rebuilt["tiles"] == manifest["tiles"]
    assert rebuilt["palette"] == manifest["palette"]

    for path in sorted(committed.joinpath("tiles").rglob("*.png")):
        relative = path.relative_to(committed)
        fresh = (copy / relative).read_bytes()
        assert fresh == path.read_bytes(), f"{relative} is stale; rerun computation_atlas.tiles"
        assert hashlib.sha256(fresh).hexdigest() == hashlib.sha256(path.read_bytes()).hexdigest()
