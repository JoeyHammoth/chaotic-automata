"""Computation Atlas offline pipeline.

This package owns the data products the static site consumes: rule-space sweeps, complexity
metrics with uncertainty, and the embedding job. The browser build never imports it; the two meet
at the artefact files described in ``docs/architecture.md``.

Nothing in this package is implemented yet. It exists so the toolchain, tests and CI have a real
target while the engine spike and the design-document gaps are resolved.
"""

__version__ = "0.1.0"
