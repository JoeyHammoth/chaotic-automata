"""The binary product format from design §5.4: one header, row-major, little-endian.

A reader that ignores ``version`` is a bug, so :func:`read_product` refuses a schema it does not
know instead of handing back bytes it cannot interpret.
"""

from __future__ import annotations

import hashlib
import struct
from dataclasses import dataclass
from pathlib import Path

MAGIC = b"CATL"
VERSION = 1
DTYPE_F16 = 1
DTYPE_F32 = 2
DTYPE_U8 = 3
FLAG_HAS_NAN = 1

HEADER = struct.Struct("<4sHBBIIfI")
HEADER_BYTES = HEADER.size  # 24


@dataclass(frozen=True)
class ProductMeta:
    version: int
    dtype: int
    channels: int
    width: int
    height: int
    scale: float
    flags: int


def encode_product(
    values: list[list[float]],
    *,
    channels: int,
    width: int,
    height: int,
    scale: float = 1.0,
    has_nan: bool = False,
) -> bytes:
    """``values[cell][channel]``, row-major over ``width x height``."""
    if len(values) != width * height:
        raise ValueError(f"expected {width * height} cells, got {len(values)}")
    if any(len(cell) != channels for cell in values):
        raise ValueError("every cell must carry the same number of channels")
    flags = FLAG_HAS_NAN if has_nan else 0
    header = HEADER.pack(MAGIC, VERSION, DTYPE_F32, channels, width, height, scale, flags)
    body = bytearray(len(values) * channels * 4)
    offset = 0
    for cell in values:
        for value in cell:
            struct.pack_into("<f", body, offset, float(value))
            offset += 4
    return header + bytes(body)


def encode_layer(values: list[float], *, width: int, height: int, scale: float = 1.0) -> bytes:
    """A single-channel fp16 layer: the atlas ships one file per colouring."""
    if len(values) != width * height:
        raise ValueError(f"expected {width * height} values, got {len(values)}")
    header = HEADER.pack(MAGIC, VERSION, DTYPE_F16, 1, width, height, scale, 0)
    return header + struct.pack(f"<{len(values)}e", *values)


def read_layer(path: str | Path) -> tuple[ProductMeta, list[float]]:
    data = Path(path).read_bytes()
    meta = read_header(data)
    if meta.dtype != DTYPE_F16:
        raise ValueError(f"read_layer expects fp16, found dtype {meta.dtype}")
    count = meta.width * meta.height * meta.channels
    body = data[HEADER_BYTES:]
    if len(body) != count * 2:
        raise ValueError(f"expected {count * 2} bytes of samples, found {len(body)}")
    return meta, list(struct.unpack(f"<{count}e", body))


def encode_labels(values: list[int], *, channels: int, width: int, height: int) -> bytes:
    if len(values) != width * height * channels:
        raise ValueError("label count does not match width x height x channels")
    header = HEADER.pack(MAGIC, VERSION, DTYPE_U8, channels, width, height, 1.0, 0)
    return header + bytes(values)


def read_header(data: bytes) -> ProductMeta:
    if len(data) < HEADER_BYTES:
        raise ValueError("file is shorter than a product header")
    magic, version, dtype, channels, width, height, scale, flags = HEADER.unpack_from(data)
    if magic != MAGIC:
        raise ValueError(f"not a product file: magic is {magic!r}")
    if version != VERSION:
        raise ValueError(f"product schema {version} is not supported; expected {VERSION}")
    return ProductMeta(version, dtype, channels, width, height, scale, flags)


def read_product(path: str | Path) -> tuple[ProductMeta, list[list[float]]]:
    data = Path(path).read_bytes()
    meta = read_header(data)
    if meta.dtype != DTYPE_F32:
        raise ValueError(f"read_product expects f32, found dtype {meta.dtype}")
    count = meta.width * meta.height
    stride = meta.channels
    values: list[list[float]] = []
    view = memoryview(data)[HEADER_BYTES:]
    expect = count * stride * 4
    if len(view) != expect:
        raise ValueError(f"expected {expect} bytes of samples, found {len(view)}")
    unpacked = struct.unpack(f"<{count * stride}f", view)
    for cell in range(count):
        start = cell * stride
        values.append(list(unpacked[start : start + stride]))
    return meta, values


def read_labels(path: str | Path) -> tuple[ProductMeta, list[int]]:
    data = Path(path).read_bytes()
    meta = read_header(data)
    if meta.dtype != DTYPE_U8:
        raise ValueError(f"read_labels expects u8, found dtype {meta.dtype}")
    return meta, list(data[HEADER_BYTES:])


def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
