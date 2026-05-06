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

---

## MP1 — Pandas analysis of the HYG star catalog

A pandas-based exploration of real star data to ask whether positional clustering can recover constellation-like groups, whether bright stars carry constellation structure, and what stellar properties characterize different sky regions.

**Notebook:** [`MP1/a5_analysis.ipynb`](MP1/a5_analysis.ipynb)

### Dataset

[HYG database v4.2](https://www.astronexus.com/projects/hyg) by David Nash / astronexus.com — ~119,626 stars with positions (`ra`, `dec`), distance, apparent and absolute magnitude, color index (`ci`), spectral class (`spect`), luminosity (`lum`), constellation (`con`), and more. The CSV used is `MP1/MP1 for Pandas Stars file.csv`.

### The three questions

1. **Can stars be grouped into constellations based on their positions in the sky using proximity?** — K-Means on `(ra, dec)` for visible stars (`mag < 6.5`).
2. **Do brighter stars tend to form the main structure of constellations compared to dimmer stars?** — per-cluster average magnitude, count of bright (`mag < 3.0`) "anchor" stars, and a focused look at the Orion-region cluster.
3. **What star characteristics (temperature via `ci`, luminosity, spectral class) are associated with different clusters?** — mean color index and luminosity per cluster, plus the dominant spectral class per cluster.

### Required pandas operations used (all five)

| Operation | Where it shows up |
|-----------|-------------------|
| `head` | `df.head()` for first-look inspection |
| `info` | `df.info()` for dtypes and non-null counts |
| `isnull` | `df.isnull().sum()` to find missing fields like `spect`, `ci`, `lum` |
| filtering | `visible_df = df[df['mag'] < 6.5]` for human-eye-visible stars |
| `value_counts` | `visible_df['con'].value_counts().head(20)` and `spect_class` distribution |
| `groupby` | per-cluster aggregations for position, brightness, color, and spectral class |

### How to run

```bash
pip install pandas numpy matplotlib scikit-learn jupyter
jupyter notebook MP1/a5_analysis.ipynb
```

Then run the cells top-to-bottom. The notebook also expects `MP1/MP1 for Pandas Stars file.csv` to be next to the notebook.
