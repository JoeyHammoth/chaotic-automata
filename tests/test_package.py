"""Toolchain smoke tests.

They assert only what exists today: the package imports and carries a semantic version. Behaviour
tests arrive with the metrics pipeline, each pinned to a verified constant in docs/methods.md.
"""

from computation_atlas import __version__


def test_version_is_semver():
    parts = __version__.split(".")
    assert len(parts) == 3
    assert all(part.isdigit() for part in parts)
