# Week 2 — Competency 2: Code literacy & documentation

**Competency 2** in HCDE 530 is about **code literacy** (reading, running, and reasoning about small programs and data pipelines) and **documentation** (making work understandable to your future self, peers, and reviewers).

## What I practiced this week

- Ran **`demo_word_count.py`** against structured survey-style data in **`demo_responses.csv`**.
- **Read and edited** the CSV to connect the file on disk to what the script prints (IDs, roles, response text).
- Added and refined **inline comments** in Python so the script’s purpose and steps stay clear in a **research/design** voice—not just syntax notes.

## Documentation I focused on

Two places mattered most for Competency 2:

1. **Comments in code** — short notes above or beside blocks that explain *what each section is for* (e.g. loading data, counting words, printing a summary). That supports code literacy because someone else (or you in three weeks) can follow the logic without re-deriving it.
2. **Commit messages** — each commit tells a small story of what changed and why, which is documentation outside the `.py` file and helps faculty or collaborators scan the repo history.

Together, comments and commits are the minimum viable “paper trail” for a small coursework repo: one explains the **intent** inside the code; the other explains **changes over time**.

## Reflection

Working with CSV + Python this week made **data shape** (columns, rows, text fields) concrete: literacy here means knowing where the “ground truth” lives and how the script transforms it into printed summaries. Documenting that path—in comments and in commits—is what ties Competency 2 to how UX researchers and designers collaborate with engineers: shared clarity on what ran and what it was supposed to mean.

---

*You can add a sentence here about what felt most hands-on—e.g. editing lines yourself vs. reading terminal errors—if you want that on the record for your portfolio.*
