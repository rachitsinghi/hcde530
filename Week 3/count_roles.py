"""Count how often each role appears in responses.csv (normalized); print and write role_counts.csv."""
import csv
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
INPUT_CSV = HERE / "responses.csv"
OUTPUT_CSV = HERE / "role_counts.csv"


def normalized_role(raw: str) -> str:
    t = (raw or "").strip()
    if not t:
        return "no label"
    return t.title()


counts: Counter[str] = Counter()
with open(INPUT_CSV, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        counts[normalized_role(row.get("role", ""))] += 1

# Stable sort: most common first, then alphabetically by role
ordered = sorted(counts.items(), key=lambda x: (-x[1], x[0]))

print(f"Role counts ({INPUT_CSV.name}, {sum(counts.values())} row(s)):")
print(f"{'role':<28} count")
print("-" * 36)
for role, n in ordered:
    print(f"{role:<28} {n}")

with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["role", "count"])
    w.writeheader()
    for role, n in ordered:
        w.writerow({"role": role, "count": n})

print()
print(f"Wrote: {OUTPUT_CSV}")
