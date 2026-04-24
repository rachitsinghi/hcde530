"""Call the Week 4 API, print category and helpful votes per review, save CSV. Dependencies: Week 4/requirements.txt."""
from __future__ import annotations

import csv
from pathlib import Path
from urllib.parse import urljoin

import requests

API_ROOT = "https://hcde530-week4-api.onrender.com/"
# join the API root and the reviews url
REVIEWS_URL = urljoin(API_ROOT, "reviews")
# set the page limit to 100
PAGE_LIMIT = 100
# get the path to the current file
HERE = Path(__file__).resolve().parent
# set the output csv file name
OUTPUT_CSV = HERE / "reviews_category_helpful.csv"

# fetch the json from the url
def fetch_json(url: str) -> dict:
    # Ask for JSON explicitly so misconfigured servers are less likely to return HTML.
    resp = requests.get(url, headers={"Accept": "application/json"}, timeout=60)
    resp.raise_for_status()  # surface 4xx/5xx instead of silently parsing error bodies
    return resp.json()


def main() -> None:
    try:
        meta = fetch_json(API_ROOT)
    except requests.RequestException as exc:
        raise SystemExit(f"Could not reach API root {API_ROOT!r}: {exc}") from exc

    print(f"Connected: {meta.get('name', 'API')}")

    rows: list[dict[str, str | int]] = []
    offset = 0  # API uses limit/offset pagination across the full review set

    while True:
        page_url = f"{REVIEWS_URL}?limit={PAGE_LIMIT}&offset={offset}"
        try:
            payload = fetch_json(page_url)
        except requests.RequestException as exc:
            raise SystemExit(f"Could not fetch reviews: {exc}") from exc

        reviews = payload.get("reviews") or []
        total = int(payload.get("total") or 0)  # total across all pages (usually 500 for this API)

        for review in reviews:
            category = str(review.get("category", ""))
            votes = review.get("helpful_votes")
            if votes is None:
                votes_int = 0  # treat missing helpful_votes as zero for CSV consistency
            else:
                votes_int = int(votes)
            print(f"{category}: {votes_int} helpful vote(s)")
            rows.append({"category": category, "helpful_votes": votes_int})

        offset += len(reviews)
        if not reviews or offset >= total:  # stop when a page is empty or we have seen every row
            break

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["category", "helpful_votes"])
        writer.writeheader()
        writer.writerows(rows)  # utf-8 keeps non-ASCII category text intact on disk

    print(f"Wrote {len(rows)} row(s) to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
