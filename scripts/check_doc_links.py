"""Fail when a relative link in the project's Markdown points at a file that does not exist.

The check is offline and deterministic, so it belongs beside lint rather than in a nightly job: a
renamed page or a moved screenshot is caught in the pull request that moves it. Absolute URLs,
``mailto:`` links and bare fragments are skipped, and so is anything inside a fenced block or inline
code, because a path shown as an example is not a link.

Run from anywhere: ``python scripts/check_doc_links.py``.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent

# Tracked Markdown. Directories are walked; `.scratch/`, `.agents/` and the legacy lab are not part
# of what a reader is promised, and the untracked chat log is not tracked at all.
SOURCES = [
    "README.md",
    "AGENTS.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "SUPPORT.md",
    "CODE_OF_CONDUCT.md",
    "GLOSSARY.md",
    "site/README.md",
    "docs",
    ".github",
]

FENCE = re.compile(r"```.*?```", re.DOTALL)
INLINE_CODE = re.compile(r"`[^`\n]*`")
LINK = re.compile(r"!?\[[^\]]*\]\((?:<([^>]+)>|([^)\s]+))\)")
SCHEME = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")


def markdown_files() -> list[Path]:
    files: list[Path] = []
    for source in SOURCES:
        path = ROOT / source
        if path.is_dir():
            files.extend(sorted(path.rglob("*.md")))
        elif path.is_file():
            files.append(path)
    return files


def targets(text: str) -> list[str]:
    without_code = INLINE_CODE.sub("", FENCE.sub("", text))
    return [match.group(1) or match.group(2) for match in LINK.finditer(without_code)]


def is_skipped(target: str) -> bool:
    return bool(SCHEME.match(target)) or target.startswith(("#", "//"))


def resolve(page: Path, target: str) -> Path:
    location = unquote(target.split("#", 1)[0])
    if location.startswith("/"):
        return ROOT / location.lstrip("/")
    return page.parent / location


def main() -> int:
    pages = markdown_files()
    broken: list[str] = []
    for page in pages:
        for target in targets(page.read_text(encoding="utf-8")):
            if is_skipped(target) or not target.split("#", 1)[0]:
                continue
            if not resolve(page, target).exists():
                broken.append(f"{page.relative_to(ROOT).as_posix()}: {target}")

    if broken:
        print(f"broken relative links ({len(broken)}):")
        for entry in broken:
            print(f"  {entry}")
        return 1

    print(f"docs links OK: {len(pages)} Markdown files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
