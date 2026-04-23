"""Read responses.csv, drop rows with empty name, capitalize role, write responses_cleaned.csv."""
from __future__ import annotations

import csv
from pathlib import Path

HERE = Path(__file__).resolve().parent
INPUT_CSV = HERE / "responses.csv"
OUTPUT_CSV = HERE / "responses_cleaned.csv"


def summarize_data(rows: list[dict]) -> str:
    """Return a short plain-language summary: row count, unique roles, empty name count."""
    n = len(rows)
    empty_names = sum(1 for row in rows if not (row.get("name") or "").strip())
    role_labels = []
    for row in rows:
        r = (row.get("role") or "").strip()
        role_labels.append(r if r else "(empty role)")
    unique = sorted(set(role_labels))
    roles_phrase = ", ".join(unique) if unique else "(none)"
    return (
        # f-string to return a string with the number of rows, the number of distinct values in the role column, and the number of rows with an empty name field
        f"This dataset has {n} row(s). "
        f"There are {len(unique)} distinct value(s) in the role column: {roles_phrase}. "
        f"{empty_names} row(s) have an empty name field."
    )


cleaned = []
with open(INPUT_CSV, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    if not fieldnames:
        raise SystemExit("responses.csv has no header row.")

    for row in reader:
        name = (row.get("name") or "").strip()
        # if the name is empty, skip the row
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
print(summarize_data(cleaned))
