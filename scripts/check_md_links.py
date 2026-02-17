#!/usr/bin/env python3
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

REPO_ROOT = Path(__file__).resolve().parents[1]

# Matches Markdown links/images: [text](target) and ![alt](target)
LINK_RE = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")


def iter_markdown_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "*.md"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    files = [Path(line.strip()) for line in result.stdout.splitlines() if line.strip()]
    return files


def should_skip_target(target: str) -> bool:
    target = target.strip()
    if not target:
        return True

    # <path/to/file.md>
    if target.startswith("<") and target.endswith(">"):
        target = target[1:-1].strip()

    if target.startswith("#"):
        return True

    parsed = urlparse(target)
    if parsed.scheme:
        return True

    return False


def normalize_target(target: str) -> str:
    target = target.strip()
    if target.startswith("<") and target.endswith(">"):
        target = target[1:-1].strip()

    target = target.split("#", 1)[0]
    target = target.split("?", 1)[0]
    target = unquote(target)
    return target


def check_links() -> list[tuple[str, str]]:
    broken: list[tuple[str, str]] = []

    for md_rel_path in iter_markdown_files():
        md_abs_path = REPO_ROOT / md_rel_path
        try:
            content = md_abs_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            content = md_abs_path.read_text(encoding="utf-8", errors="ignore")

        for match in LINK_RE.finditer(content):
            raw_target = match.group(1).strip()

            if should_skip_target(raw_target):
                continue

            normalized = normalize_target(raw_target)
            if not normalized:
                continue

            target_abs_path = (md_abs_path.parent / normalized).resolve()
            if not target_abs_path.exists():
                broken.append((md_rel_path.as_posix(), raw_target))

    return broken


def main() -> int:
    broken = check_links()
    if broken:
        print("Broken markdown links found:")
        for src, link in broken:
            print(f"{src} -> {link}")
        return 1

    print("All markdown relative links are valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
