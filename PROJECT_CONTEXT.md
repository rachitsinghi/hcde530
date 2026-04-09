# Project context — HCDE 530 (Rachit)

Human-readable brief for collaborators, reviewers, and coding assistants.  
*Derived from a short interview; update this file if your situation changes.*

## Purpose

- **Primary use:** Course **assignments** for HCDE 530.
- **End goal:** A **clear repository of code** (and related artifacts) you can point to after the quarter.

## Audience

- **Readers:** **Faculty** and **peers**.
- **Organization:** **`Week N/`** folders so work is easy to scan week by week.

## Role and perspective

- **Background:** Human-centered design practitioner (**UX research** and **UX design**), **not** a software engineer.
- **Comment voice:** Prefer **many short comments** framed as a researcher/designer would explain them—not low-level syntax tutorials.
- **Balance:** When both fit, split about **50/50** between:
  - **Research framing** (what the data represents, what you’d trust for a decision, limitations, rigor).
  - **Design framing** (users, flows, implications for the product, handoff or critique).

## Constraints and engineering style

- **Libraries:** No course requirement to use specific stacks; choose what fits the assignment.
- **Complexity:** **Don’t over-engineer.** Favor small, readable scripts that match the assignment scope.
- **Dependencies:** Prefer **standard library** when reasonable (e.g. `csv`, `pathlib`); add third-party packages only when they clearly help.

## Data and week-folder contents

- **Data:** Expect a **mix** of **demo/synthetic** examples and **assignment-appropriate** “real-style” datasets.
- **Artifacts per week:** In addition to code, you may keep **CSVs**, **screenshots**, **HTML summaries/dashboards**, and similar outputs **alongside** scripts in the same `Week N/` folder when the assignment calls for it.

## Git and privacy (current default)

- **Current stance:** For this coursework repo, you’re comfortable **committing and pushing** what you need for assignments (including many artifacts above).
- **Future caveat:** If you later work with **identifiable participants**, **employer-confidential** material, or **unreleased products**, revisit what belongs in a **public** repo; use redaction, synthetic substitutes, or a private store outside Git.

## What “good collaboration” looks like here

- Explain **why** a step exists in HCD terms, not only **what** the code does.
- Keep folder and file names **predictable** within each week.
- After **adding, removing, or moving** tracked files, refresh the directory tree in `.cursorrules` (see repo root `.cursorrules` or run `python3 scripts/refresh_cursorrules_tree.py`).
