from __future__ import annotations

import csv
import re
from collections import defaultdict
from pathlib import Path

# -----------------------------------------------------------------------------
# Theme map: descriptive labels -> trigger phrases (case-insensitive substring).
# A response "mentions" a theme if any trigger appears in response_text.
# -----------------------------------------------------------------------------
THEME_TRIGGERS = {
    "Reliability & failures (broken flows, errors, regressions)": [
        "broken",
        "error",
        "unusable",
        "inconsistent",
        "removed",
        "something went wrong",
        "limitation",
        "unhelpful",
        "doesn't work",
    ],
    "Performance & responsiveness (slow UI, lag, loading, sync)": [
        "slow",
        "lag",
        "loading",
        "response time",
        "spinner",
        "sync",
        "off by",
    ],
    "Delight & advocacy (love, excellence, recommendations)": [
        "love",
        "excellent",
        "huge improvement",
        "recommend",
        "smooth",
        "great",
        "worth it",
    ],
    "Findability & navigation (discoverability, IA, onboarding)": [
        "confusing",
        "buried",
        "figure out",
        "impossible",
        "cannot figure",
        "onboarding",
        "navigation",
        "tooltip",
    ],
    "Collaboration & multi-user friction": [
        "collaboration",
        "conflicts",
        "real-time",
        "sharing",
    ],
    "Notification & attention overload": [
        "notifications",
        "ping",
        "out of control",
    ],
    "Documentation & clarity": [
        "documentation",
        "api documentation",
        "clear",
        "thorough",
    ],
    "Mobile, density, and ergonomics": [
        "mobile",
        "tiny",
        "buttons",
        "keyboard",
    ],
}


def _normalized_role(row: dict) -> str:
    r = (row.get("role") or "").strip()
    return r.title() if r else "(no role)"


def _response_lower(row: dict) -> str:
    return (row.get("response_text") or "").lower()


def _text_matches_trigger(text_lower: str, trigger: str) -> bool:
    """Single-word triggers use word boundaries so e.g. 'find' does not match 'findings'."""
    t = trigger.strip().lower()
    if not t:
        return False
    if " " in t:
        return t in text_lower
    return re.search(r"\b" + re.escape(t) + r"\b", text_lower) is not None


def Thematic_result(rows: list[dict], keyword: str | None = None) -> dict:
    """Analyze open-ended survey text for thematic patterns.

    Uses ``response_text`` on each row. Theme labels and trigger phrases come from
    ``THEME_TRIGGERS`` (unless a single ``keyword`` search is requested).

    Args:
        rows: Survey rows, e.g. from ``csv.DictReader``, each with ``response_text``
            and ``role`` (and any other fields ignored here).
        keyword: If set, only count how many rows match this word or phrase, with
            counts split by normalized role. If ``None``, run full theme coding:
            each row can match multiple themes; each theme counts at most once per row.

    Returns:
        In **keyword** mode: ``{"mode": "keyword", "keyword": str, "response_count": int,
        "by_role": {role: count}}``.

        In **themes** mode: ``{"mode": "themes", "theme_response_counts": {theme: n},
        "theme_by_role": {theme: {role: n}}, "top_themes": [{"label": ..., "response_count": n}, ...]}``
        where ``top_themes`` lists every theme tied for the highest response count.
    """
    if keyword:
        k = keyword.strip().lower()
        if not k:
            return {"mode": "keyword", "keyword": keyword, "response_count": 0, "by_role": {}}
        by_role: dict[str, int] = defaultdict(int)
        total = 0
        for row in rows:
            text = _response_lower(row)
            if not _text_matches_trigger(text, k):
                continue
            total += 1
            by_role[_normalized_role(row)] += 1
        return {
            "mode": "keyword",
            "keyword": keyword,
            "response_count": total,
            "by_role": dict(sorted(by_role.items())),
        }

    theme_response_counts: dict[str, int] = {t: 0 for t in THEME_TRIGGERS}
    theme_by_role: dict[str, dict[str, int]] = {t: defaultdict(int) for t in THEME_TRIGGERS}

    for row in rows:
        text = _response_lower(row)
        role = _normalized_role(row)
        for theme, triggers in THEME_TRIGGERS.items():
            if any(_text_matches_trigger(text, tr) for tr in triggers):
                theme_response_counts[theme] += 1
                theme_by_role[theme][role] += 1

    max_count = max(theme_response_counts.values(), default=0)
    top_labels = sorted(t for t, c in theme_response_counts.items() if c == max_count)
    return {
        "mode": "themes",
        "theme_response_counts": dict(
            sorted(theme_response_counts.items(), key=lambda x: (-x[1], x[0]))
        ),
        "theme_by_role": {t: dict(sorted(d.items())) for t, d in theme_by_role.items()},
        "top_themes": [{"label": lab, "response_count": max_count} for lab in top_labels],
    }


def print_theme_report(result: dict) -> None:
    """Pretty-print output from Thematic_result(..., keyword=None)."""
    if result["mode"] != "themes":
        return
    print("\nResponse themes (keyword matches in free text):")
    for theme, n in result["theme_response_counts"].items():
        print(f"  {n:2d}  {theme}")
    tops = result["top_themes"]
    if len(tops) == 1:
        t0 = tops[0]
        print(f"\nMost common theme (most responses mentioning it): {t0['label']}")
        print(f"  → {t0['response_count']} response(s)")
    else:
        labs = [t["label"] for t in tops]
        n = tops[0]["response_count"] if tops else 0
        print(f"\nMost common themes (tied at {n} response(s) each):")
        for lab in labs:
            print(f"  • {lab}")
    print("\nSame themes broken out by role (count of responses per role):")
    for theme in result["theme_response_counts"]:
        by_r = result["theme_by_role"].get(theme, {})
        if not by_r or result["theme_response_counts"][theme] == 0:
            continue
        parts = [f"{role}: {c}" for role, c in sorted(by_r.items(), key=lambda x: -x[1])]
        print(f"  {theme}")
        print(f"    {' | '.join(parts)}")


def write_analysis_export_csv(
    path: Path,
    *,
    role_counts: dict[str, int],
    avg_experience: float,
    n_rows: int,
    top5: list[tuple[str, int]],
    bottom5: list[tuple[str, int]],
    theme_result: dict,
    keyword_results: list[tuple[str, dict]],
) -> None:
    """Write tabular summary of script outputs for reporting or charts."""
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["section", "category", "name", "value"])
        w.writerow(["summary", "n_responses", "", str(n_rows)])
        w.writerow(["summary", "avg_experience_years", "", f"{avg_experience:.4f}"])
        for role, count in sorted(role_counts.items()):
            label = role if role.strip() else "(no role)"
            w.writerow(["role_counts", "role", label, str(count)])
        for i, (name, score) in enumerate(top5, start=1):
            w.writerow(["satisfaction_top", f"rank_{i}", name, str(score)])
        for i, (name, score) in enumerate(bottom5, start=1):
            w.writerow(["satisfaction_low", f"rank_{i}", name, str(score)])
        for theme, n in theme_result["theme_response_counts"].items():
            w.writerow(["theme_response_counts", "theme", theme, str(n)])
        for item in theme_result["top_themes"]:
            w.writerow(
                ["top_theme", "tied_winner", item["label"], str(item["response_count"])]
            )
        for theme, n in theme_result["theme_response_counts"].items():
            if n == 0:
                continue
            for role, c in theme_result["theme_by_role"].get(theme, {}).items():
                w.writerow(["theme_by_role", theme, role, str(c)])
        for kw, spot in keyword_results:
            w.writerow(["keyword_spotlight", kw, "response_count", str(spot["response_count"])])
            for role, c in spot.get("by_role", {}).items():
                w.writerow(["keyword_spotlight", kw, role, str(c)])


# Load the survey data from a CSV file
HERE = Path(__file__).resolve().parent
filename = HERE / "week3_survey_messy.csv"
rows = []

with open(filename, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        rows.append(row)

# Count responses by role
# Normalize role names so "ux researcher" and "UX Researcher" are counted together
role_counts = {}

for row in rows:
    role = row["role"].strip().title()
    if role in role_counts:
        role_counts[role] += 1
    else:
        role_counts[role] = 1

print("Responses by role:")
for role, count in sorted(role_counts.items()):
    print(f"  {role}: {count}")

# Calculate the average years of experience
total_experience = 0
for row in rows:
    total_experience += int(row["experience_years"])

avg_experience = total_experience / len(rows)
print(f"\nAverage years of experience: {avg_experience:.1f}")

# Find the top 5 highest satisfaction scores
scored_rows = []
for row in rows:
    if row["satisfaction_score"].strip():
        name = (row["participant_name"] or "").strip() or "(no name)"
        scored_rows.append((name, int(row["satisfaction_score"])))

top5 = sorted(scored_rows, key=lambda x: x[1], reverse=True)[:5]
bottom5 = sorted(scored_rows, key=lambda x: x[1])[:5]

print("\nTop 5 satisfaction scores:")
for name, score in top5:
    print(f"  {name}: {score}")

print("\nLowest 5 satisfaction scores:")
for name, score in bottom5:
    print(f"  {name}: {score}")

# Thematic analysis of open-ended responses
theme_result = Thematic_result(rows)
print_theme_report(theme_result)

# Examples: single-keyword spotlight (optional patterns from the brief)
keyword_results: list[tuple[str, dict]] = []
for kw in ("slow", "broken", "love"):
    spot = Thematic_result(rows, keyword=kw)
    keyword_results.append((kw, spot))
    print(f"\nResponses mentioning “{kw}”: {spot['response_count']} (by role: {spot['by_role']})")

export_path = HERE / "week3_analysis_output.csv"
write_analysis_export_csv(
    export_path,
    role_counts=role_counts,
    avg_experience=avg_experience,
    n_rows=len(rows),
    top5=top5,
    bottom5=bottom5,
    theme_result=theme_result,
    keyword_results=keyword_results,
)
print(f"\nWrote analysis export: {export_path}")
