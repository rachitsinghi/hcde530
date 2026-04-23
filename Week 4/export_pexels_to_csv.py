"""Call the Pexels Search API, parse JSON, and save photo records to CSV (default: 50+ rows).

Uses `PEXELS_API_KEY` from `Week 4/.env` (same rules as `fetch_drug_images.py`).

Dependencies: Week 4/requirements.txt (requests).
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
import time
from pathlib import Path
from typing import Any

import requests

PEXELS_SEARCH = "https://api.pexels.com/v1/search"
HERE = Path(__file__).resolve().parent
ENV_PATH = HERE / ".env"
DEFAULT_OUTPUT = HERE / "pexels_search_export.csv"
REQUEST_TIMEOUT = 60
SLEEP_SEC = 0.35


def load_env(path: Path) -> None:
    if not path.is_file():
        return
    raw = path.read_text(encoding="utf-8-sig").strip()
    if not raw:
        return
    first = raw.splitlines()[0].strip()
    if "=" not in first:
        os.environ["PEXELS_API_KEY"] = raw.strip()
        return
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k:
            os.environ[k] = v


def pexels_api_key() -> str | None:
    load_env(ENV_PATH)
    return os.environ.get("PEXELS_API_KEY")


def flatten_photo(photo: dict[str, Any], *, search_query: str, api_page: int) -> dict[str, Any]:
    src = photo.get("src") if isinstance(photo.get("src"), dict) else {}
    assert isinstance(src, dict)
    large = src.get("large2x") or src.get("large") or src.get("medium") or ""
    row: dict[str, Any] = {
        "id": photo.get("id", ""),
        "width": photo.get("width", ""),
        "height": photo.get("height", ""),
        "photographer": photo.get("photographer", ""),
        "photographer_id": photo.get("photographer_id", ""),
        "photographer_url": photo.get("photographer_url", ""),
        "avg_color": photo.get("avg_color", ""),
        "alt": photo.get("alt", ""),
        "photo_page_url": photo.get("url", ""),
        "image_large_url": large if isinstance(large, str) else "",
        "search_query": search_query,
        "api_page": api_page,
    }
    return {k: ("" if v is None else v) for k, v in row.items()}


FIELDNAMES = [
    "id",
    "width",
    "height",
    "photographer",
    "photographer_id",
    "photographer_url",
    "avg_color",
    "alt",
    "photo_page_url",
    "image_large_url",
    "search_query",
    "api_page",
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Export Pexels search results to CSV.")
    parser.add_argument(
        "--query",
        default="pharmacy stock photo",
        help="Pexels search query (default: pharmacy stock photo).",
    )
    parser.add_argument(
        "--min-rows",
        type=int,
        default=50,
        help="Minimum number of CSV rows to collect (default: 50).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output CSV path (default: {DEFAULT_OUTPUT.name} next to this script).",
    )
    parser.add_argument(
        "--per-page",
        type=int,
        default=40,
        help="Results per API request, max 80 (default: 40).",
    )
    args = parser.parse_args()
    per_page = max(1, min(80, args.per_page))

    key = pexels_api_key()
    if not key:
        if ENV_PATH.is_file() and ENV_PATH.stat().st_size == 0:
            print(
                f"{ENV_PATH} is empty on disk — save the file if your key is only in the editor.",
                file=sys.stderr,
            )
        raise SystemExit(
            f"Missing PEXELS_API_KEY. Set it in {ENV_PATH} (see https://www.pexels.com/api/)."
        )

    rows: list[dict[str, Any]] = []
    seen: set[int] = set()
    # Paginate with explicit `page` — Pexels sometimes returns a broken `next_page` URL (/v1/v1/search).
    api_page = 1

    while len(rows) < args.min_rows:
        try:
            resp = requests.get(
                PEXELS_SEARCH,
                params={
                    "query": args.query,
                    "per_page": per_page,
                    "page": api_page,
                },
                headers={"Authorization": key},
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 401:
                raise SystemExit(
                    "Pexels 401 Unauthorized — check PEXELS_API_KEY in .env."
                ) from exc
            raise SystemExit(f"Pexels request failed: {exc}") from exc
        except requests.RequestException as exc:
            raise SystemExit(f"Pexels request failed: {exc}") from exc

        data = resp.json()
        if not isinstance(data, dict):
            raise SystemExit("Unexpected JSON: top value is not an object.")

        photos = data.get("photos") or []
        if not isinstance(photos, list):
            photos = []

        for photo in photos:
            if not isinstance(photo, dict):
                continue
            pid = photo.get("id")
            if not isinstance(pid, int) or pid in seen:
                continue
            seen.add(pid)
            rows.append(
                flatten_photo(photo, search_query=args.query, api_page=api_page)
            )
            if len(rows) >= args.min_rows:
                break

        if len(rows) >= args.min_rows:
            break
        if not photos:
            break

        api_page += 1
        time.sleep(SLEEP_SEC)

    if len(rows) < args.min_rows:
        raise SystemExit(
            f"Only collected {len(rows)} unique photo(s); need {args.min_rows}. "
            "Try a broader --query or increase results available for that search."
        )

    out_path = args.output
    if not out_path.is_absolute():
        out_path = HERE / out_path

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows[: args.min_rows])

    written = min(len(rows), args.min_rows)
    print(f"Wrote {written} row(s) to {out_path}")


if __name__ == "__main__":
    main()
