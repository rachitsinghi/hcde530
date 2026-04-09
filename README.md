# HCDE 530 — coursework repository

Human-centered design coursework: weekly folders (`Week N/`) with Python scripts, CSV data, and occasional HTML dashboards.

## Quick start

From the repository root:

```bash
python3 "Week 2/demo_word_count.py"
```

The script loads `demo_responses.csv` from **next to the script** (`Path(__file__)`), so this works whether your terminal is in the repo root or inside `Week 2/`.

Open the Week 2 dashboard in a browser by opening `Week 2/demo_dashboard.html` (double-click or “Open with…”).

## Project docs

| Doc | Purpose |
|-----|---------|
| **[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)** | Your goals, audience, and how you want code commented (HCD voice). |
| **[.cursorrules](.cursorrules)** | Rules for AI assistants + auto-generated directory tree. |

## Repository hygiene

- **`.gitignore`** ignores macOS `.DS_Store` (do not commit Finder metadata).
- **Optional Git hook:** after cloning, run `git config core.hooksPath .githooks` so pre-commit refreshes the directory tree in `.cursorrules`. See `.cursorrules` for details.

## Layout

```
Week 2/
  week2.md                 # reflection (Competency 2)
  demo_word_count.py       # word counts from demo_responses.csv
  demo_responses.csv
  demo_dashboard.html      # static dashboard (embedded data)
  response_word_analysis.py
  sample_responses.csv
  response_word_stats_output.csv   # generated when you run response_word_analysis.py
```

Add later weeks as `Week 3/`, `Week 4/`, etc., the same way when you have new modules.
