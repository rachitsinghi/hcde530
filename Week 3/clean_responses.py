"""Read responses.csv, drop rows with empty name, capitalize role, write responses_cleaned.csv."""
import csv
from pathlib import Path

HERE = Path(__file__).resolve().parent
INPUT_CSV = HERE / "responses.csv"
OUTPUT_CSV = HERE / "responses_cleaned.csv"

cleaned = []
with open(INPUT_CSV, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    if not fieldnames:
        raise SystemExit("responses.csv has no header row.")

    for row in reader:
        name = (row.get("name") or "").strip()
        if not name:
            continue
        row = dict(row)
        row["name"] = name
        role = row.get("role") or ""
        row["role"] = role.strip().title()
        cleaned.append(row)

with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(cleaned)

print(f"Wrote {len(cleaned)} row(s) to {OUTPUT_CSV}")
