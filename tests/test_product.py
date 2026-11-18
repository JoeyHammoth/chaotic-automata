"""The product header is a contract with the site, so it is tested as one."""

from __future__ import annotations

import math
import struct

import pytest

from computation_atlas.product import (
    HEADER_BYTES,
    MAGIC,
    VERSION,
    encode_labels,
    encode_product,
    read_header,
    read_labels,
    read_product,
    sha256_of,
)


def sample_values(width: int = 2, height: int = 2, channels: int = 3) -> list[list[float]]:
    return [
        [cell * 0.25 + channel for channel in range(channels)]
        for cell in range(width * height)
    ]


def test_product_round_trips_through_a_file(tmp_path) -> None:
    values = sample_values()
    path = tmp_path / "metrics.bin"
    path.write_bytes(encode_product(values, channels=3, width=2, height=2))

    meta, decoded = read_product(path)
    assert meta.version == VERSION
    assert meta.channels == 3
    assert (meta.width, meta.height) == (2, 2)
    for got_row, want_row in zip(decoded, values, strict=True):
        assert got_row == pytest.approx(want_row)


def test_header_layout_is_the_documented_one() -> None:
    data = encode_product(sample_values(), channels=3, width=2, height=2, scale=2.0)
    magic, version, dtype, channels, width, height, scale, flags = struct.unpack(
        "<4sHBBIIfI", data[:HEADER_BYTES]
    )
    assert magic == MAGIC
    assert (version, dtype, channels, width, height) == (VERSION, 2, 3, 2, 2)
    assert scale == 2.0
    assert flags == 0


def test_nan_is_declared_not_discovered() -> None:
    values = sample_values()
    values[0][0] = math.nan
    meta = read_header(encode_product(values, channels=3, width=2, height=2, has_nan=True))
    assert meta.flags == 1


def test_unknown_schema_is_refused() -> None:
    data = bytearray(encode_product(sample_values(), channels=3, width=2, height=2))
    data[4:6] = struct.pack("<H", 99)
    with pytest.raises(ValueError, match="schema 99"):
        read_header(bytes(data))


def test_wrong_magic_is_refused() -> None:
    with pytest.raises(ValueError, match="not a product file"):
        read_header(b"NOPE" + encode_product(sample_values(), channels=3, width=2, height=2)[4:])


def test_labels_round_trip(tmp_path) -> None:
    path = tmp_path / "classes.bin"
    path.write_bytes(encode_labels([1, 2, 3, 4], channels=1, width=2, height=2))
    meta, labels = read_labels(path)
    assert meta.channels == 1
    assert labels == [1, 2, 3, 4]


def test_reserved_length_mismatch_is_refused() -> None:
    data = encode_product(sample_values(), channels=3, width=2, height=2)
    with pytest.raises(ValueError, match="shorter than a product header"):
        read_header(data[:10])
    assert sha256_of(data) == sha256_of(bytes(data))
