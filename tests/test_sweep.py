"""The sweep, pinned. Marked ``sweep`` because it needs the Rust binary."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from computation_atlas import sweep
from computation_atlas.metrics import CLASS_CODES
from computation_atlas.product import read_labels, read_product, sha256_of
from computation_atlas.space import LANDMARKS

pytestmark = pytest.mark.sweep

REPO_ROOT = Path(__file__).resolve().parents[1]
GOLDEN = REPO_ROOT / "tests" / "golden" / "sample_profile.json"
PRODUCT = REPO_ROOT / "products" / "sample"


@pytest.fixture(scope="module")
def binary() -> str:
    try:
        return str(sweep.find_binary())
    except sweep.SweepUnavailable as error:
        pytest.skip(str(error))


def test_golden_profile_matches_the_committed_file(binary: str) -> None:
    result = sweep.run_sweep(sweep.PROFILES["golden"], binary)
    payload = sweep.golden_payload(result)
    committed = json.loads(GOLDEN.read_text(encoding="utf-8"))
    assert payload == committed, (
        "the pipeline drifted from tests/golden/sample_profile.json; if the change is intended, "
        "regenerate with `python -m computation_atlas.sweep --profile golden --golden --out "
        "tests/golden` and review the diff"
    )


def test_golden_profile_is_repeatable(binary: str) -> None:
    first = sweep.run_sweep(sweep.PROFILES["golden"], binary)
    second = sweep.run_sweep(sweep.PROFILES["golden"], binary)
    assert sweep.golden_payload(first) == sweep.golden_payload(second)


def _product_or_skip() -> tuple[dict, dict, list[list[float]], list[int]]:
    if not (PRODUCT / "manifest.json").exists():
        pytest.skip("sample product not built")
    manifest = json.loads((PRODUCT / "manifest.json").read_text(encoding="utf-8"))
    for product in manifest["products"]:
        data = (PRODUCT / product["path"]).read_bytes()
        assert len(data) == product["bytes"]
        assert sha256_of(data) == product["sha256"], f"{product['path']} drifted from its manifest"
    meta, values = read_product(PRODUCT / "metrics.bin")
    _, labels = read_labels(PRODUCT / "classes.bin")
    return manifest, {"meta": meta}, values, labels


def test_sample_product_matches_its_manifest() -> None:
    manifest, _, values, _ = _product_or_skip()
    assert len(values) == 64 * 64
    assert len(values[0]) == len(manifest["channels"])
    assert any(math.isfinite(value) for row in values for value in row)


def test_landmarks_land_in_their_expected_metric_regions() -> None:
    manifest, _, values, _ = _product_or_skip()
    meta = read_product(PRODUCT / "metrics.bin")[0]
    channel_index = {name: index for index, name in enumerate(manifest["channels"])}
    rules = json.loads((PRODUCT / "rules.json").read_text(encoding="utf-8"))

    # Expectations come from the code, not the manifest snapshot: the claims are the test's subject.
    expectations = {landmark.name: landmark.expectations for landmark in LANDMARKS}

    for landmark in manifest["space"]["landmarks"]:
        cell = manifest["space"]["landmark_cells"][landmark["name"]]
        index = cell["y"] * meta.width + cell["x"]
        assert rules[index]["rule"] == landmark["rule"]
        row = values[index]
        for metric, bounds in expectations[landmark["name"]].items():
            mean = row[channel_index[f"{metric}:mean"]]
            low, high = bounds
            assert low <= mean <= high, (
                f"{landmark['name']} ({landmark['rule']}) has {metric}={mean:.3f}, "
                f"outside the expected region [{low}, {high}]"
            )


def test_landmarks_are_ordered_as_the_literature_suggests() -> None:
    """Relative position in metric space, which survives the small-torus caveat."""
    manifest, _, values, _ = _product_or_skip()
    meta = read_product(PRODUCT / "metrics.bin")[0]
    channel_index = {name: index for index, name in enumerate(manifest["channels"])}

    means = {}
    for landmark in manifest["space"]["landmarks"]:
        cell = manifest["space"]["landmark_cells"][landmark["name"]]
        row = values[cell["y"] * meta.width + cell["x"]]
        means[landmark["name"]] = {
            metric: row[channel_index[f"{metric}:mean"]]
            for metric in ("activity", "spatial_entropy")
        }

    activity = {name: values["activity"] for name, values in means.items()}
    entropy = {name: values["spatial_entropy"] for name, values in means.items()}
    # Seeds has no survival at all: every live cell dies each step, so it must out-churn the rest.
    assert max(activity, key=activity.get) == "Seeds", "Seeds should be the most active landmark"
    # Seeds rebuilds the field from scratch every step, so it must also be the noisiest.
    assert max(entropy, key=entropy.get) == "Seeds"


def test_undecided_rules_are_labelled_and_counted() -> None:
    manifest, _, _, _ = _product_or_skip()
    counts = manifest["class_counts"]
    assert sum(counts.values()) == 64 * 64
    assert set(counts) <= set(CLASS_CODES)
    assert "undecided" in counts, "the sample should contain cap-hitting rules"
    _, labels = read_labels(PRODUCT / "classes.bin")
    undecided = sum(1 for code in labels[0::2] if code == CLASS_CODES["undecided"])
    assert undecided == counts["undecided"], "the label file and the manifest disagree"
