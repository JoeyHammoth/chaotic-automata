"""The atlas product: its landmarks must measure what the literature predicts.

The 512x512 map is a preview (`docs/limitations.md`), so this test asserts the claim the design's
validation target makes — the landmarks sit inside their expected metric ranges — and deliberately
not a class colour. Which expectations this budget cannot pay for is declared in `space.py`
(`SAMPLE_ONLY_METRICS`), so the test need not remember the layer list. Life, HighLife and Seeds
never repeat on a 64x64 torus at any affordable cap, so they are `undecided` by ADR 0003 at every
budget this pipeline can pay for; that is the honest answer, not a regression waiting to be fixed
by a bigger cap.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from computation_atlas.product import read_layer
from computation_atlas.space import LANDMARKS, SAMPLE_ONLY_METRICS, rule_at

REPO_ROOT = Path(__file__).resolve().parents[1]
PRODUCT = REPO_ROOT / "products" / "atlas"


@pytest.fixture(scope="module")
def atlas() -> tuple[dict[str, object], dict[str, list[float]]]:
    manifest_path = PRODUCT / "manifest.json"
    if not manifest_path.exists():
        pytest.skip("the atlas product is not present")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    layers: dict[str, list[float]] = {}
    for layer in manifest["layers"]:
        _, values = read_layer(PRODUCT / layer["path"])
        layers[layer["metric"]] = values
    return manifest, layers


def test_manifest_landmarks_are_the_chart_landmarks(atlas) -> None:
    """The label a reader clicks and the cell the sweep measured must be the same rule."""
    manifest, _ = atlas
    listed = {entry["name"]: entry for entry in manifest["space"]["landmarks"]}
    assert set(listed) == {landmark.name for landmark in LANDMARKS}
    for landmark in LANDMARKS:
        entry = listed[landmark.name]
        assert entry["rule"] == landmark.rule
        assert (entry["birth_index"], entry["survival_index"]) == (
            landmark.birth_index,
            landmark.survival_index,
        )
        assert rule_at(entry["birth_index"], entry["survival_index"]).canonical() == landmark.rule


def test_landmarks_land_in_their_expected_metric_regions(atlas) -> None:
    """Expectations come from `space.py`, not the shipped numbers: the claims are the subject."""
    manifest, layers = atlas
    width = manifest["space"]["tile"][0]
    claimed = {metric for landmark in LANDMARKS for metric in landmark.expectations}
    assert SAMPLE_ONLY_METRICS <= claimed, "SAMPLE_ONLY_METRICS names a metric no landmark claims"
    checked = 0
    for landmark in LANDMARKS:
        for metric, (low, high) in landmark.atlas_expectations.items():
            # No skip here: `atlas_expectations` already drops the sample-only metrics, so a
            # missing layer means the product lost a check, not that the budget is thin.
            assert metric in layers, f"{metric} is an atlas expectation but no layer ships it"
            mean = layers[metric][landmark.survival_index * width + landmark.birth_index]
            assert low <= mean <= high, (
                f"{landmark.name} ({landmark.rule}) has {metric}={mean:.3f}, "
                f"outside the expected region [{low}, {high}]"
            )
            checked += 1
    assert checked >= 6, f"only {checked} expectations could be checked against the atlas layers"
