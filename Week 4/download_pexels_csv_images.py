"""Download image files for each row in a Pexels export CSV (default: pexels_search_export.csv).

Reads `id` and `image_large_url`, saves under `Week 4/pexels_search_export_images/` as `pexels_{id}.jpg`.
Pexels CDN URLs normally work without an API key.

Dependencies: Week 4/requirements.txt (requests).
"""
from __future__ import annotations

import argparse
import csv
import re
import time
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
DEFAULT_CSV = HERE / "pexels_search_export.csv"
DEFAULT_OUT_DIR = HERE / "pexels_search_export_images"
REQUEST_TIMEOUT = 120
SLEEP_SEC = 0.2


def suffix_from_url(url: str) -> str:
    u = url.lower()
    if ".png" in u.split("?", 1)[0]:
        return ".png"
    if ".webp" in u.split("?", 1)[0]:
        return ".webp"
    return ".jpg"


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = requests.get(url, timeout=REQUEST_TIMEOUT)
    r.raise_for_status()
    dest.write_bytes(r.content)


def safe_id(raw: str) -> str | None:
    raw = raw.strip()
    if re.fullmatch(r"\d+", raw):
        return raw
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Download images listed in a Pexels CSV export.")
    parser.add_argument(
        "--csv",
        type=Path,
        default=DEFAULT_CSV,
        help=f"Input CSV (default: {DEFAULT_CSV.name}).",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_OUT_DIR,
        help=f"Folder for image files (default: {DEFAULT_OUT_DIR.name}).",
    )
    args = parser.parse_args()

    csv_path = args.csv if args.csv.is_absolute() else HERE / args.csv
    out_dir = args.out_dir if args.out_dir.is_absolute() else HERE / args.out_dir

    if not csv_path.is_file():
        raise SystemExit(f"CSV not found: {csv_path}")

    ok = 0
    skipped = 0
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames or "image_large_url" not in reader.fieldnames:
            raise SystemExit("CSV must have an image_large_url column.")
        for row in reader:
            url = (row.get("image_large_url") or "").strip()
            pid = safe_id(str(row.get("id", "")))
            if not url or not pid:
                skipped += 1
                continue
            suffix = suffix_from_url(url)
            dest = out_dir / f"pexels_{pid}{suffix}"
            try:
                download(url, dest)
            except requests.RequestException as exc:
                print(f"skip id={pid}: {exc}")
                skipped += 1
                continue
            ok += 1
            print(dest.name)
            time.sleep(SLEEP_SEC)

    print(f"Done. Saved {ok} file(s) under {out_dir} ({skipped} skipped).")


if __name__ == "__main__":
    main()
