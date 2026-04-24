"""Download stock-style medicine / wellness images from Pexels (not FDA label photos).

Uses the Pexels Search API with queries aimed at generic stock aesthetics—flatlays,
lifestyle pharmacy shots, bottles on tables—rather than close-ups of specific pill shapes.

Writes images under `drug_images/`, a gallery HTML file with required Pexels attribution,
and `drug_images_metadata.json` for credits.

`.env`: set `PEXELS_API_KEY=...` (https://www.pexels.com/api/). If the file is one line
with no `=`, that line is used as the Pexels key.

Dependencies: Week 4/requirements.txt (requests).
"""
from __future__ import annotations

import html
import json
import os
import re
import sys
import time
from pathlib import Path

import requests

PEXELS_SEARCH = "https://api.pexels.com/v1/search"
HERE = Path(__file__).resolve().parent
ENV_PATH = HERE / ".env"
IMG_DIR = HERE / "drug_images"
GALLERY_HTML = HERE / "drug_images_gallery.html"
META_JSON = HERE / "drug_images_metadata.json"
REQUEST_TIMEOUT = 60
SLEEP_SEC = 0.35


def load_env(path: Path) -> None:
    if not path.is_file():
        return
    # utf-8-sig strips a BOM if the editor saved one
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


def slug(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")
    return (s[:40] or "photo").rstrip("_")


def search_photos(query: str, per_page: int, key: str) -> list[dict]:
    resp = requests.get(
        PEXELS_SEARCH,
        params={"query": query, "per_page": per_page},
        headers={"Authorization": key},  # Pexels expects the raw key in this header (not Bearer …)
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    return list(data.get("photos") or [])  # missing "photos" becomes [] instead of None errors downstream


def pick_src(photo: dict) -> str:
    src = photo.get("src") or {}
    if not isinstance(src, dict):
        return ""
    for k in ("large2x", "large", "medium", "original"):  # walk down in quality preference order
        u = src.get(k)
        if isinstance(u, str) and u.startswith("http"):
            return u
    return ""


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = requests.get(url, timeout=REQUEST_TIMEOUT)
    r.raise_for_status()
    dest.write_bytes(r.content)  # binary write keeps JPEG/PNG bytes exact (no text decoding)


def build_gallery_html(rows: list[dict]) -> str:
    cards = []
    for row in rows:
        rel = html.escape(row["rel"], quote=True)
        photo_url = html.escape(row["photo_url"], quote=True)
        ph = html.escape(row["photographer"], quote=True)
        ph_url = html.escape(row["photographer_url"], quote=True)
        alt = html.escape(row.get("alt") or "Photo from Pexels", quote=True)
        per_photo = (
            f'<p class="photo-credit">This <a href="{photo_url}">Photo</a> was taken by '
            f'<a href="{ph_url}">{ph}</a> on Pexels.</p>'
        )
        cards.append(
            f'<figure class="card"><img src="{rel}" alt="{alt}" loading="lazy" />{per_photo}</figure>'
        )

    cards_html = "\n".join(cards)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Medicine stock photos (Pexels)</title>
  <style>
    body {{ font-family: system-ui, sans-serif; margin: 2rem; max-width: 960px; line-height: 1.5; color: #111; }}
    h1 {{ font-size: 1.35rem; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1.25rem; margin: 1.5rem 0; }}
    .card img {{ width: 100%; height: auto; border-radius: 8px; display: block; }}
    .photo-credit {{ font-size: 0.85rem; margin: 0.5rem 0 0; }}
    footer.pexels-attribution {{ margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid #ddd; font-size: 0.95rem; }}
    footer.pexels-attribution img {{ height: 32px; width: auto; vertical-align: middle; }}
    .logo-row {{ background: #1a1a1a; padding: 0.75rem 1rem; display: inline-block; border-radius: 6px; margin: 0.5rem 0; }}
  </style>
</head>
<body>
  <h1>Stock-style medicine &amp; wellness imagery</h1>
  <p>Generic stock photos from Pexels (not FDA product shots). Open this file from disk; attribution is required.</p>
  <div class="grid">
{cards_html}
  </div>
  <footer class="pexels-attribution">
    <p><a href="https://www.pexels.com">Photos provided by Pexels</a></p>
    <p>Or show the Pexels logo (white, for dark backgrounds):</p>
    <p class="logo-row"><a href="https://www.pexels.com">
      <img src="https://images.pexels.com/lib/api/pexels-white.png" alt="Pexels" />
    </a></p>
    <p>Or the Pexels logo (default):</p>
    <p><a href="https://www.pexels.com">
      <img src="https://images.pexels.com/lib/api/pexels.png" alt="Pexels" />
    </a></p>
  </footer>
</body>
</html>
"""


def main() -> None:
    key = pexels_api_key()
    if not key:
        if ENV_PATH.is_file() and ENV_PATH.stat().st_size == 0:
            print(
                f"{ENV_PATH} is empty on disk — save the file if your key is only in the editor.",
                file=sys.stderr,
            )
        raise SystemExit(
            f"Missing Pexels API key. Add PEXELS_API_KEY=... to {ENV_PATH} "
            "(https://www.pexels.com/api/)."
        )

    # Stock / lifestyle phrasing—fewer macro “one weird pill” results.
    queries: list[tuple[str, int]] = [
        ("pharmacy stock photo", 4),
        ("medicine flatlay white background", 4),
        ("wellness supplements table lifestyle", 3),
        ("healthcare pills bottle lifestyle", 3),
        ("vitamins bottles minimal aesthetic", 3),
    ]

    IMG_DIR.mkdir(parents=True, exist_ok=True)
    seen_ids: set[int] = set()
    rows: list[dict] = []

    for query, per_page in queries:
        print(f"--- Pexels: {query!r} ---")
        try:
            photos = search_photos(query, per_page, key)
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 401:
                raise SystemExit(
                    "Pexels returned 401 Unauthorized — use a Pexels API key from "
                    "https://www.pexels.com/api/ in .env as PEXELS_API_KEY."
                ) from exc
            raise SystemExit(f"Pexels request failed: {exc}") from exc
        except requests.RequestException as exc:
            raise SystemExit(f"Pexels request failed: {exc}") from exc

        for photo in photos:
            if not isinstance(photo, dict):
                continue
            pid = photo.get("id")
            if not isinstance(pid, int):
                continue
            if pid in seen_ids:
                continue  # same photo can appear in overlapping search results
            seen_ids.add(pid)

            src_url = pick_src(photo)
            if not src_url:
                continue

            ext = ".png" if "png" in src_url.lower() else ".jpg"
            fname = f"stock_{pid}_{slug(query)}{ext}"
            dest = IMG_DIR / fname
            try:
                download(src_url, dest)
            except requests.RequestException as exc:
                print(f"  skip download {pid}: {exc}")
                continue

            photo_url = photo.get("url") if isinstance(photo.get("url"), str) else "https://www.pexels.com"
            photographer = photo.get("photographer") if isinstance(photo.get("photographer"), str) else "Photographer"
            ph_url = (
                photo.get("photographer_url")
                if isinstance(photo.get("photographer_url"), str)
                else "https://www.pexels.com"
            )
            alt = photo.get("alt") if isinstance(photo.get("alt"), str) else ""

            rows.append(
                {
                    "rel": f"{IMG_DIR.name}/{fname}",  # relative path works when opening gallery via file://
                    "photo_url": photo_url,
                    "photographer": photographer,
                    "photographer_url": ph_url,
                    "alt": alt,
                }
            )
            print(f"  saved {fname}")
        time.sleep(SLEEP_SEC)

    if not rows:
        raise SystemExit("No photos downloaded — try different queries or check the API key.")

    GALLERY_HTML.write_text(build_gallery_html(rows), encoding="utf-8")
    META_JSON.write_text(json.dumps(rows, indent=2), encoding="utf-8")

    print(f"Wrote {len(rows)} image(s) under {IMG_DIR}")
    print(f"Wrote gallery: {GALLERY_HTML}")
    print(f"Wrote metadata: {META_JSON}")


if __name__ == "__main__":
    main()
