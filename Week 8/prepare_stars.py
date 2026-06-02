"""
prepare_stars.py
Filters the HYG star catalog to naked-eye-visible stars (mag < 6.5)
and exports a clean CSV for the constellation website.

Run from repo root:
  python3 "Week 8/prepare_stars.py"

Output: Week 8/stars_visible.csv (~8,835 stars, ~200KB)
"""

import csv
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / "MP1" / "MP1 for Pandas Stars file.csv"
OUT = HERE / "stars_visible.csv"

OUT_FIELDS = [
    "id",
    "ra_deg",
    "dec",
    "mag",
    "ci",
    "spect",
    "lum",
    "proper",
    "dist",
    "x",
    "y",
    "z",
]


def _float(val, default=None):
    if val is None or val == "":
        return default
    try:
        return float(val)
    except ValueError:
        return default


def _int(val, default=0):
    if val is None or val == "":
        return default
    try:
        return int(float(val))
    except ValueError:
        return default


def to_xyz(ra_deg, dec_deg, dist_pc):
    ra_rad = math.radians(ra_deg)
    dec_rad = math.radians(dec_deg)
    x = dist_pc * math.cos(dec_rad) * math.cos(ra_rad)
    y = dist_pc * math.cos(dec_rad) * math.sin(ra_rad)
    z = dist_pc * math.sin(dec_rad)
    return x, y, z


def main():
    loaded = 0
    kept = 0
    rows_out = []

    with SRC.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            loaded += 1
            mag = _float(row.get("mag"))
            dist = _float(row.get("dist"))
            if mag is None or mag >= 6.5:
                continue
            if dist is None or dist <= 0.01:
                continue

            ra_h = _float(row.get("ra"), 0.0)
            dec = _float(row.get("dec"), 0.0)
            ra_deg = ra_h * 15.0
            x, y, z = to_xyz(ra_deg, dec, dist)

            proper = (row.get("proper") or "").strip()
            ci = _float(row.get("ci"), 0.0)
            spect = (row.get("spect") or "").strip() or "Unknown"
            lum = _float(row.get("lum"), 1.0)

            rows_out.append(
                {
                    "id": _int(row.get("id")),
                    "ra_deg": round(ra_deg, 4),
                    "dec": round(dec, 4),
                    "mag": round(mag, 4),
                    "ci": round(ci, 4),
                    "spect": spect,
                    "lum": round(lum, 4),
                    "proper": proper,
                    "dist": round(dist, 4),
                    "x": round(x, 4),
                    "y": round(y, 4),
                    "z": round(z, 4),
                }
            )
            kept += 1

    with OUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUT_FIELDS)
        writer.writeheader()
        writer.writerows(rows_out)

    print(f"Loaded {loaded:,} stars from HYG catalog")
    print(f"After mag < 6.5 and dist > 0.01 filter: {kept:,} stars")
    print(f"Saved {kept:,} stars to {OUT}")
    print(f"File size: {OUT.stat().st_size / 1024:.0f} KB")
    print("Done. Upload stars_visible.csv to your Lovable project's public/ folder.")


if __name__ == "__main__":
    main()
