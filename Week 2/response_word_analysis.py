"""Analyze word counts for survey quotes, interview snippets, or app reviews from a CSV."""
import csv
from pathlib import Path

# -----------------------------------------------------------------------------
# Paths: CSV lives next to this script; output CSV is written beside it as well.
# -----------------------------------------------------------------------------
HERE = Path(__file__).resolve().parent
INPUT_CSV = HERE / "sample_responses.csv"
OUTPUT_CSV = HERE / "response_word_stats_output.csv"


def word_count(text: str) -> int:
    """Count words by splitting on whitespace (same idea as a simple readability check)."""
    t = (text or "").strip()
    if not t:
        return 0
    return len(t.split())


def preview(text: str, max_len: int = 60) -> str:
    """Short preview for the terminal table and the export file."""
    if len(text) <= max_len:
        return text
    return text[:max_len].rstrip() + "..."


# -----------------------------------------------------------------------------
# Load rows: expects a column named "response" and uses "id" for each row label.
# -----------------------------------------------------------------------------
rows = []
with open(INPUT_CSV, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        rows.append(row)

# -----------------------------------------------------------------------------
# Compute stats per row and overall (shortest / longest / average word counts).
# -----------------------------------------------------------------------------
enriched = []
counts = []
for row in rows:
    rid = row.get("id", "").strip() or "(no id)"
    resp = row.get("response", "")
    wc = word_count(resp)
    counts.append(wc)
    enriched.append(
        {
            "id": rid,
            "word_count": wc,
            "preview": preview(resp),
            "response": resp,
        }
    )

n = len(counts)
total_words = sum(counts)
shortest = min(counts) if counts else 0
longest = max(counts) if counts else 0
average = total_words / n if n else 0.0

# -----------------------------------------------------------------------------
# Print each row: ID, word count, and first ~60 characters (preview).
# -----------------------------------------------------------------------------
print(f"{'ID':<8} {'Words':<6} {'Preview (first 60 chars)'}")
print("-" * 72)
for item in enriched:
    print(f"{item['id']:<8} {item['word_count']:<6} {item['preview']}")

# -----------------------------------------------------------------------------
# Summary block: how many responses, spread of lengths, and average length.
# -----------------------------------------------------------------------------
print()
print("── Summary ─────────────────────────────────────────────────────────────")
print(f"  Total responses : {n}")
print(f"  Shortest        : {shortest} words")
print(f"  Longest         : {longest} words")
print(f"  Average         : {average:.1f} words")

# -----------------------------------------------------------------------------
# Stretch: write a new CSV with one row per input plus word_count and preview.
# -----------------------------------------------------------------------------
with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
    fieldnames = ["id", "word_count", "preview", "response"]
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    for item in enriched:
        writer.writerow({k: item[k] for k in fieldnames})

print()
print(f"Wrote detailed results to: {OUTPUT_CSV}")
