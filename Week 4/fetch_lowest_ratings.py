"""Fetch lowest-rated reviews from the Week 4 API and append per-app VADER sentiment summaries."""
from __future__ import annotations

import csv
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urljoin

import requests
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

API_ROOT = "https://hcde530-week4-api.onrender.com/"
REVIEWS_URL = urljoin(API_ROOT, "reviews")
PAGE_LIMIT = 100

HERE = Path(__file__).resolve().parent
OUTPUT_CSV = HERE / "reviews_lowest_ratings.csv"

_analyzer: SentimentIntensityAnalyzer | None = None


def get_analyzer() -> SentimentIntensityAnalyzer:
    global _analyzer
    if _analyzer is None:
        _analyzer = SentimentIntensityAnalyzer()  # lazy init avoids reloading lexicon on every polarity() call
    return _analyzer


def polarity(text: str) -> dict[str, float]:
    return get_analyzer().polarity_scores(text)


def tone_from_compound(compound: float) -> str:
    if compound >= 0.05:
        return "positive"
    if compound <= -0.5:
        return "strongly negative"
    if compound <= -0.05:
        # return the negative tone
        return "negative"
    return "neutral"


def mean_polarity(scores: list[dict[str, float]]) -> dict[str, float]:
    n = len(scores)
    if not n:
        return {"compound": 0.0, "neg": 0.0, "neu": 0.0, "pos": 0.0}
    keys = ("compound", "neg", "neu", "pos")
    return {k: sum(s[k] for s in scores) / n for k in keys}


def fetch_json(url: str) -> dict:
    resp = requests.get(url, headers={"Accept": "application/json"}, timeout=60)
    resp.raise_for_status()
    return resp.json()


def fetch_all_reviews() -> list[dict]:
    out: list[dict] = []
    offset = 0
    while True:
        page_url = f"{REVIEWS_URL}?limit={PAGE_LIMIT}&offset={offset}"
        payload = fetch_json(page_url)
        batch = payload.get("reviews") or []
        out.extend(batch)
        total = int(payload.get("total") or 0)
        offset += len(batch)
        if not batch or offset >= total:  # same termination rule as fetch_reviews pagination
            break
    return out


def star_label(n: int) -> str:
    return "1 star" if n == 1 else f"{n} stars"


def fmt4(x: float) -> str:
    return f"{x:.4f}"


def sentiment_narrative(app: str, star_lbl: str, reasons: list[str], polarities: list[dict[str, float]]) -> str:
    avg = mean_polarity(polarities)
    compounds = [p["compound"] for p in polarities]
    tone = tone_from_compound(avg["compound"])
    n = len(reasons)
    return (
        f"{app} ({star_lbl}, {n} review(s)): VADER sentiment — mean compound {avg['compound']:.3f} "
        f"(−1 = most negative, +1 = most positive), labeled overall as {tone!r}. "
        f"Mean word-level scores: neg {avg['neg']:.3f}, neu {avg['neu']:.3f}, pos {avg['pos']:.3f}. "
        f"Single-review compound range: {min(compounds):.3f} to {max(compounds):.3f}."
    )


def sentiment_notes_cell(polarities: list[dict[str, float]]) -> str:
    compounds = [p["compound"] for p in polarities]
    return (
        f"method=VADER; n={len(polarities)}; compound_min={min(compounds):.4f}; compound_max={max(compounds):.4f}"
    )


def main() -> None:
    try:
        meta = fetch_json(API_ROOT)
    except requests.RequestException as exc:
        raise SystemExit(f"Could not reach API root {API_ROOT!r}: {exc}") from exc

    print(f"Connected: {meta.get('name', 'API')}")

    try:
        reviews = fetch_all_reviews()
    except requests.RequestException as exc:
        raise SystemExit(f"Could not fetch reviews: {exc}") from exc

    numeric_ratings: list[int] = []
    for r in reviews:
        raw = r.get("rating")
        if raw is not None:
            numeric_ratings.append(int(raw))

    if not numeric_ratings:
        raise SystemExit("No reviews with a numeric rating were returned.")

    lowest = min(numeric_ratings)  # smallest integer star rating present in this pull
    label = star_label(lowest)
    worst = [r for r in reviews if r.get("rating") is not None and int(r["rating"]) == lowest]  # tie: all apps at that rating

    rows: list[dict[str, str | int]] = []
    for r in worst:
        rid = r.get("id")
        reason = str(r.get("review", ""))  # free-text body is what VADER scores
        p = polarity(reason)
        rows.append(
            {
                "record_type": "review",
                "app": str(r.get("app", "")),
                "id": int(rid) if rid is not None else "",
                "category": str(r.get("category", "")),
                "rating": lowest,
                "rating_label": label,
                "reason": reason,
                "date": str(r.get("date", "")),
                "compound": fmt4(p["compound"]),
                "neg": fmt4(p["neg"]),
                "neu": fmt4(p["neu"]),
                "pos": fmt4(p["pos"]),
                "sentiment_notes": tone_from_compound(p["compound"]),
            }
        )

    rows.sort(key=lambda row: (str(row["app"]).lower(), row["id"] if isinstance(row["id"], int) else 0))

    by_app: dict[str, list[str]] = defaultdict(list)
    for r in worst:
        by_app[str(r.get("app", ""))].append(str(r.get("review", "")))

    summary_rows: list[dict[str, str | int]] = []
    for app in sorted(by_app, key=str.lower):  # deterministic row order for grading / diffs
        reasons = by_app[app]
        polarities = [polarity(t) for t in reasons]  # one VADER vector per review line for this app
        avg = mean_polarity(polarities)
        summary_rows.append(
            {
                "record_type": "app_sentiment",
                "app": app,
                "id": "",
                "category": "",
                "rating": lowest,
                "rating_label": label,
                "reason": sentiment_narrative(app, label, reasons, polarities),
                "date": "",
                "compound": fmt4(avg["compound"]),
                "neg": fmt4(avg["neg"]),
                "neu": fmt4(avg["neu"]),
                "pos": fmt4(avg["pos"]),
                "sentiment_notes": sentiment_notes_cell(polarities),
            }
        )

    fieldnames = [
        "record_type",
        "app",
        "id",
        "category",
        "rating",
        "rating_label",
        "reason",
        "date",
        "compound",
        "neg",
        "neu",
        "pos",
        "sentiment_notes",
    ]
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        # write the fieldnames to the file
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
        writer.writerows(summary_rows)

    print(f"Lowest rating in this dataset: {label}")
    print(f"Exported {len(rows)} review row(s) and {len(summary_rows)} sentiment summary row(s) to {OUTPUT_CSV}")
    counts = Counter(str(r["app"]) for r in rows)  # quick histogram of how many worst reviews per app
    print(f"By app ({label}):")
    for app in sorted(counts, key=str.lower):
        print(f"  {app}: {counts[app]} review(s)")
    print("Per-app sentiment (VADER mean compound):")
    for srow in summary_rows:
        print(f"  — {srow['app']}: compound={srow['compound']} ({tone_from_compound(float(srow['compound']))})")
    print("Sample review lines:")
    for r in rows[:5]:
        preview = (r["reason"] if isinstance(r["reason"], str) else str(r["reason"]))[:80]
        more = "…" if len(str(r["reason"])) > 80 else ""
        print(f"  — [{r['app']}, {label}, compound={r['compound']}] {preview}{more}")


if __name__ == "__main__":
    main()
