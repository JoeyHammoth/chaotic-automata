"""Fail when ``CITATION.cff`` disagrees with the newest release tag.

``CITATION.cff`` is what a citation manager reads, so it has to name a release that exists. Nothing
else in the repository moves when a tag is cut, so this check reads the newest ``v*`` tag and
compares two fields: ``version`` must be the tag without its leading ``v``, and ``date-released``
must be the date on the tag's own commit — the day the release was cut. The version was right and
the date was wrong for ``v0.1.0``, which is the drift this makes visible.

A repository with no release tags has nothing to compare against and passes. Git and the standard
library are the only requirements: ``CITATION.cff`` is read as text, not parsed as YAML, so the
pipeline does not gain a dependency for two lines of metadata.

Run from anywhere: ``python scripts/check_citation.py``.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CITATION = ROOT / "CITATION.cff"

# The two fields that describe a release. Everything else in the file is prose that a tag cannot
# contradict.
FIELDS = ("version", "date-released")


def git(*args: str) -> str:
    result = subprocess.run(("git", *args), cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def scalar(text: str, key: str) -> str | None:
    """Read one top-level scalar. Keys inside ``authors`` or after ``abstract`` are indented."""
    match = re.search(rf"^{re.escape(key)}:[ \t]*(.*)$", text, re.MULTILINE)
    if match is None:
        return None
    value = match.group(1).strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    return value or None


def newest_tag() -> str | None:
    tags = git("tag", "--list", "v*", "--sort=-v:refname").split()
    return tags[0] if tags else None


def main() -> int:
    text = CITATION.read_text(encoding="utf-8")
    tag = newest_tag()
    if tag is None:
        print("citation OK: no release tag yet, so there is nothing to compare")
        return 0

    expected = {
        "version": tag[1:],
        "date-released": git("log", "-1", "--format=%cs", tag),
    }
    problems: list[str] = []
    for key in FIELDS:
        found = scalar(text, key)
        if found is None:
            problems.append(f"  {key}: missing, but tag {tag} says {expected[key]!r}")
        elif found != expected[key]:
            problems.append(f"  {key}: {found!r}, but tag {tag} says {expected[key]!r}")

    if problems:
        print(f"CITATION.cff does not match the newest release tag {tag}:")
        for problem in problems:
            print(problem)
        print("Set both fields to the tag's version and date, or cut the release first.")
        return 1

    print(f"citation OK: {tag}, released {expected['date-released']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
