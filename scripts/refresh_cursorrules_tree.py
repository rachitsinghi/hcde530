#!/usr/bin/env python3
"""Rewrite the directory tree between markers in .cursorrules (repo root)."""
from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CURSORRULES = REPO / ".cursorrules"
BEGIN = "<!-- PROJECT_TREE_BEGIN -->"
END = "<!-- PROJECT_TREE_END -->"

SKIP_NAMES = {".git", "__pycache__", ".DS_Store"}
SKIP_SUFFIXES = {".pyc"}


def skip_path(path: Path) -> bool:
    if path.name in SKIP_NAMES:
        return True
    if path.suffix in SKIP_SUFFIXES:
        return True
    return False


def tree_block(root: Path) -> str:
    lines: list[str] = [f"{root.name}/"]

    def children_of(p: Path) -> list[Path]:
        if not p.is_dir():
            return []
        out = [c for c in p.iterdir() if not skip_path(c)]
        return sorted(out, key=lambda x: (not x.is_dir(), x.name.lower()))

    def walk(directory: Path, prefix: str) -> None:
        kids = children_of(directory)
        for i, child in enumerate(kids):
            last = i == len(kids) - 1
            branch = "└── " if last else "├── "
            ext = "    " if last else "│   "
            suffix = "/" if child.is_dir() else ""
            lines.append(f"{prefix}{branch}{child.name}{suffix}")
            if child.is_dir():
                walk(child, prefix + ext)

    walk(root, "")
    return "\n".join(lines)


def main() -> None:
    if not CURSORRULES.is_file():
        raise SystemExit(f"Missing {CURSORRULES}")
    text = CURSORRULES.read_text(encoding="utf-8")
    if BEGIN not in text or END not in text:
        raise SystemExit(f"{CURSORRULES} must contain {BEGIN} and {END}")
    before, _, rest = text.partition(BEGIN)
    _, _, after = rest.partition(END)
    tree = tree_block(REPO)
    new_body = f"{before}{BEGIN}\n```\n{tree}\n```\n{END}{after}"
    CURSORRULES.write_text(new_body, encoding="utf-8")
    print(f"Updated tree in {CURSORRULES}")


if __name__ == "__main__":
    main()
