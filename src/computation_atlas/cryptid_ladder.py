"""Produce the cryptid ladder: the four quoted walks carried to 10^10 by the mirror.

The product's own budget is 10^9, because that is what `computation_atlas.verifier` writes in twelve
minutes and what the page draws. This artefact is the same walk carried one decade further by
`crates/ca-cryptid`, kept beside the product rather than in place of it: the mirror is compared with
the producer at 10^6 on every differential run, and with this ladder's own product samples at 10^9,
so the extension is the producer's walk and not a second definition of it.

Every machine string comes from `verifier.CRYPTIDS`, so this file names the machines nowhere. What
it produces is not a verdict: a machine that has not halted at 10^10 is undecided at that budget,
and the ladder records only how far its tape had spread.

    python -m computation_atlas.cryptid_ladder
"""

from __future__ import annotations

import json
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from computation_atlas import verifier

LADDER_STEPS = 10_000_000_000
OUTPUT = Path("products/verifier/cryptid-ladder.json")
COMMAND = "cargo run -p ca-cryptid --release -- --machine <string> --steps 10000000000"


def find_binary() -> Path:
    """The mirror, built. `CA_CRYPTID_BIN` wins so CI can point at its own build."""
    override = os.environ.get("CA_CRYPTID_BIN")
    if override:
        return Path(override)
    for profile in ("release", "debug"):
        for name in ("ca-cryptid.exe", "ca-cryptid"):
            candidate = Path("target") / profile / name
            if candidate.exists():
                return candidate
    raise FileNotFoundError("cargo build -p ca-cryptid --release")


def ladder_samples() -> list[int]:
    """The product's decades plus the one the product does not reach."""
    return sorted(set(verifier.CRYPTID_SAMPLES) | {LADDER_STEPS})


def walk(binary: Path, machine: str) -> dict:
    result = subprocess.run(
        [
            str(binary),
            "--machine",
            machine,
            "--steps",
            str(LADDER_STEPS),
            "--samples",
            ",".join(str(sample) for sample in ladder_samples()),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def build(binary: Path) -> dict:
    with ThreadPoolExecutor(max_workers=len(verifier.CRYPTIDS)) as pool:
        walks = list(pool.map(lambda entry: walk(binary, entry["string"]), verifier.CRYPTIDS))
    machines = [
        {"name": entry["name"], "string": entry["string"], **trace}
        for entry, trace in zip(verifier.CRYPTIDS, walks, strict=True)
    ]
    return {
        "version": 1,
        "generated_by": "crates/ca-cryptid",
        "command": COMMAND,
        "steps": LADDER_STEPS,
        "samples": ladder_samples(),
        "machines": machines,
    }


def main() -> None:
    document = build(find_binary())
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    for machine in document["machines"]:
        last = machine["samples"][-1]
        print(
            f"{machine['name']}: halted {machine['halted']}, span {last['span']:,} "
            f"at {last['steps']:,} steps"
        )
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
