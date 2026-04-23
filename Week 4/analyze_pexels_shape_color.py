"""Analyze Pexels export images for **pill / drug shape** and **pill / drug colour** (not whole-scene tags).

- **Colours:** Parses Pexels `alt` text for drug-related clauses, strips common “on a … background” tails,
  and collects allowed colour words near pills/capsules/tablets. If the alt does not name colours but
  clearly describes pills, falls back to dominant hues in a **centre crop** of the JPEG (rough proxy).
- **Shapes:** Keyword / phrase rules on the same clauses for blister packs, round tablets, capsules,
  scattered pills, bottles, vials, heart layouts, mixed assortments, or **no clear pill subject**.

Outputs:
  - `pexels_shape_color_analysis.csv` — per-image rows with `shape_category_headers` and
    `colour_category_headers` (e.g. `Shape: Oval or capsule | …`), then a **category index**
    block listing each shape/colour group and member `id` / filenames in `alt_excerpt`.
  - `pexels_shape_color_summary.md` — same grouping as prose with bullets

Dependencies: Week 4/requirements.txt (Pillow).
"""
from __future__ import annotations

import argparse
import colorsys
import csv
import re
from collections import Counter
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
DEFAULT_CSV = HERE / "pexels_search_export.csv"
DEFAULT_IMG_DIR = HERE / "pexels_search_export_images"
OUT_CSV = HERE / "pexels_shape_color_analysis.csv"
OUT_MD = HERE / "pexels_shape_color_summary.md"

# Human-readable titles and one-line blurbs for the categorization document
SHAPE_SECTION: dict[str, tuple[str, str]] = {
    "blister_foil_pack": (
        "Blister or foil pack",
        "Medication in a blister sheet, foil pack, or similar unit-dose packaging.",
    ),
    "heart_shaped_pill_layout": (
        "Heart-shaped arrangement",
        "Pills or capsules arranged in a heart shape or described as heart-shaped.",
    ),
    "round_flat_tablets": (
        "Round flat tablets",
        "Round, flat tablets or ‘pill’ shapes described as round or white tablets.",
    ),
    "oval_or_capsule": (
        "Oval or capsule",
        "Oval capsules, two-piece capsules, or ‘capsule’ wording in the caption.",
    ),
    "loose_scattered_pills": (
        "Loose or scattered pills",
        "Pills lying loose, scattered, in a flat lay, or on a surface rather than only in retail shelving.",
    ),
    "bottle_or_tub_container": (
        "Bottle or container",
        "Pills in or with a bottle, jar, tub, or glass container.",
    ),
    "vial_ampoule_or_syringe": (
        "Vial, ampoule, or syringe",
        "Injectable-style presentation: vials, ampoules, small flasks, or syringes.",
    ),
    "mixed_multi_shape_pills": (
        "Mixed shapes or many colours",
        "Assorted or colourful mixes where several shapes or colours appear together.",
    ),
    "loose_roundish_pills_generic": (
        "Pills or tablets (general)",
        "Caption refers to pills or tablets without a more specific shape tag.",
    ),
    "unspecified_pill_shape": (
        "Pill subject, shape unspecified",
        "Medication or pills are mentioned but the caption does not spell out a clear shape rule.",
    ),
    "no_clear_pill_or_blister_subject": (
        "No clear pill close-up",
        "Scene focus (e.g. shopfront, sign, people) without a clear pill or blister in the caption.",
    ),
}

COLOUR_SECTION: dict[str, tuple[str, str]] = {
    "white": ("White", "White or near-white pills or drug packaging called out in the caption or crop."),
    "yellow": ("Yellow", "Yellow or golden pills or capsules."),
    "red": ("Red", "Red or crimson medication."),
    "blue": ("Blue", "Blue tablets, capsules, or blue-and-white combinations."),
    "green": ("Green", "Green pills or green-dominated drug imagery."),
    "orange": ("Orange", "Orange pills or capsules."),
    "purple": ("Purple", "Purple or violet medication or strong purple in the pill region."),
    "pink": ("Pink", "Pink or rose-tinted pills."),
    "brown": ("Brown", "Brown or sepia-toned drug objects."),
    "gray": ("Gray", "Gray or silver-grey pills or neutral grey drug tones."),
    "black": ("Black", "Black or very dark pills or containers described as black."),
    "silver": ("Silver", "Silver foil, metallic blister, or silver-toned packaging."),
    "teal": ("Teal / cyan", "Teal or cyan-tinted medication."),
    "multicolor": ("Multicolour", "Several strong colours together or ‘assorted / colourful’ wording."),
}

# Alt text colour tokens → normalized pill/drug colour label
COLOR_TOKEN_TO_LABEL: dict[str, str] = {
    "white": "white",
    "black": "black",
    "gray": "gray",
    "grey": "gray",
    "silver": "silver",
    "red": "red",
    "crimson": "red",
    "yellow": "yellow",
    "gold": "yellow",
    "golden": "yellow",
    "orange": "orange",
    "green": "green",
    "blue": "blue",
    "navy": "blue",
    "teal": "teal",
    "cyan": "teal",
    "purple": "purple",
    "violet": "purple",
    "magenta": "purple",
    "pink": "pink",
    "rose": "pink",
    "brown": "brown",
    "sepia": "brown",
    "multicolor": "multicolor",
    "multicolored": "multicolor",
    "colorful": "multicolor",
    "assorted": "multicolor",
}

PILL_NOUN_RE = re.compile(
    r"\b(pills?|tablets?|capsules?|capsule|medication|medicines?|medicine|"
    r"prescribed drugs|blister|blister pack|medication pill|oval medication|"
    r"drugs?|heart-shaped|heart shaped)\b",
    re.IGNORECASE,
)

# Ordered: more specific phrases first for shape tagging
PILL_SHAPE_RULES: list[tuple[str, list[str]]] = [
    ("blister_foil_pack", ["blister pack", "blister", "foil pack", "silver pack", "prescription pills in blister"]),
    ("heart_shaped_pill_layout", ["heart-shaped", "heart shaped", "heart-shaped cluster"]),
    ("round_flat_tablets", ["round pill", "round medication", "white tablets", "white round", "oval medication pill"]),
    ("oval_or_capsule", ["capsule", "capsules", "blue and white capsule", "blue and white capsules"]),
    ("loose_scattered_pills", ["scattered", "flat lay", "flatlay", "lying on", "lying against", "on marble", "on green surface", "on purple", "on yellow", "on pink", "on blue surface", "on blue background", "on vibrant blue", "on grey surface", "on white marble", "on dark background", "pile of", "cluster of multicolored"]),
    ("bottle_or_tub_container", ["bottle of pills", "pills behind glass", "glass container", "white container", "container and scattered", "medicine bottle", "small black bottle", "clear glass bottle", "red bottle"]),
    ("vial_ampoule_or_syringe", ["vial", "vials", "ampoule", "flasks", "flask", "botulinum", "syringe"]),
    ("mixed_multi_shape_pills", ["assorted", "various colorful", "colorful assortment", "colorful pills", "multicolored", "medication diversity", "pharmaceutical diversity", "assorted colorful"]),
    ("loose_roundish_pills_generic", ["pills", "pill ", " tablet", "tablets", "medication pill"]),
]

SKIP_COLOR_CONTEXT = re.compile(
    r"\b(female|male|pharmacist|customer|woman|man|people|building|street|"
    r"sign|neon|facade|museum|interior|exterior|wooden|glass cabinet|shelves?)\b",
    re.IGNORECASE,
)


def hex_to_rgb(hex_s: str) -> tuple[int, int, int] | None:
    s = (hex_s or "").strip().lstrip("#")
    if len(s) != 6 or not re.fullmatch(r"[0-9a-fA-F]{6}", s):
        return None
    return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)


def rgb_to_color_family(r: int, g: int, b: int) -> str:
    rn, gn, bn = r / 255.0, g / 255.0, b / 255.0
    h, s, v = colorsys.rgb_to_hsv(rn, gn, bn)
    if v < 0.18:
        return "black"
    if s < 0.12 and v > 0.88:
        return "white"
    if s < 0.14:
        return "gray"
    if h >= 0.92 or h < 0.02:
        return "red"
    if 0.02 <= h < 0.08:
        return "orange"
    if 0.08 <= h < 0.18:
        return "yellow"
    if 0.18 <= h < 0.42:
        return "green"
    if 0.42 <= h < 0.52:
        return "teal"
    if 0.52 <= h < 0.72:
        return "blue"
    if 0.72 <= h < 0.92:
        return "purple"
    return "pink"


def family_to_pill_label(fam: str) -> str:
    return {
        "black": "black",
        "white": "white",
        "gray": "gray",
        "red": "red",
        "orange": "orange",
        "yellow": "yellow",
        "green": "green",
        "teal": "teal",
        "blue": "blue",
        "purple": "purple",
        "pink": "pink",
    }.get(fam, fam)


def strip_background_tail(clause: str) -> str:
    """Remove trailing 'on a/an/the … background|surface' so we do not tag background as pill colour."""
    t = clause.strip()
    t = re.split(
        r"\s+,\s*(?:resembling|ideal for|symbolizing|captured|representing)\b.*$",
        t,
        maxsplit=1,
    )[0]
    t = re.split(
        r"\s+on (?:a |the |an )?(?:vibrant |bright |light )?(?:[a-z\s-]+)?(?:background|surface)\b",
        t,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0]
    return t.strip(" ,")


def pill_relevant_clauses(alt: str) -> list[str]:
    """Sentences / segments that mention pills or blister-like subjects."""
    raw = (alt or "").strip()
    if not raw:
        return []
    chunks = re.split(r"(?<=[.!?])\s+|(?<=;)\s*", raw)
    out: list[str] = []
    for ch in chunks:
        ch = ch.strip()
        if not ch:
            continue
        if PILL_NOUN_RE.search(ch):
            out.append(strip_background_tail(ch))
    if not out and PILL_NOUN_RE.search(raw):
        out.append(strip_background_tail(raw))
    return out


def extract_pill_colors_from_clauses(clauses: list[str]) -> list[str]:
    labels: set[str] = set()
    token_re = re.compile(
        r"\b(white|black|gray|grey|silver|red|crimson|yellow|gold|golden|orange|green|blue|navy|"
        r"teal|cyan|purple|violet|magenta|pink|rose|brown|sepia|multicolor|multicolored|colorful|assorted)\b",
        re.IGNORECASE,
    )
    for cl in clauses:
        low = cl.lower()
        if SKIP_COLOR_CONTEXT.search(low) and not PILL_NOUN_RE.search(low):
            continue
        for m in token_re.finditer(low):
            raw_tok = m.group(1).lower()
            lab = COLOR_TOKEN_TO_LABEL.get(raw_tok)
            if lab:
                labels.add(lab)
    return sorted(labels)


def extract_pill_shapes_from_text(text: str) -> list[str]:
    low = text.lower()
    tags: list[str] = []
    for tag, phrases in PILL_SHAPE_RULES:
        if any(p in low for p in phrases):
            tags.append(tag)
    return sorted(set(tags))


def extract_pill_shapes(alt: str) -> list[str]:
    clauses = pill_relevant_clauses(alt)
    if not clauses:
        return []
    all_tags: set[str] = set()
    for c in clauses:
        all_tags.update(extract_pill_shapes_from_text(c))
    return sorted(all_tags)


def has_pill_subject(alt: str) -> bool:
    return bool(PILL_NOUN_RE.search(alt or ""))


def sample_center_crop_colors(path: Path, step: int = 2) -> Counter[str]:
    """Dominant hue families in central 40% × 40% of image (proxy for pills in many product shots)."""
    ctr: Counter[str] = Counter()
    with Image.open(path) as im:
        im = im.convert("RGB")
        w, h = im.size
        cx0, cx1 = int(w * 0.30), int(w * 0.70)
        cy0, cy1 = int(h * 0.30), int(h * 0.70)
        im = im.crop((cx0, cy0, cx1, cy1))
        max_side = 100
        ww, hh = im.size
        if max(ww, hh) > max_side:
            s = max_side / max(ww, hh)
            im = im.resize((max(1, int(ww * s)), max(1, int(hh * s))), Image.Resampling.LANCZOS)
        px = im.load()
        ww, hh = im.size
        for y in range(0, hh, step):
            for x in range(0, ww, step):
                r, g, b = px[x, y]
                ctr[family_to_pill_label(rgb_to_color_family(r, g, b))] += 1
    return ctr


def dominant_pill_colors_from_image(ctr: Counter[str], min_frac: float = 0.16, max_n: int = 4) -> list[str]:
    total = sum(ctr.values()) or 1
    pairs = sorted(ctr.items(), key=lambda kv: kv[1], reverse=True)
    out: list[str] = []
    for name, count in pairs:
        if count / total < min_frac:
            continue
        if name in ("white", "gray", "black") and count / total < 0.24:
            if any(p[0] not in ("white", "gray", "black") and p[1] / total >= min_frac for p in pairs):
                continue
        out.append(name)
        if len(out) >= max_n:
            break
    chrom = [x for x in out if x not in ("white", "gray", "black")]
    if len(chrom) >= 2:
        out.append("multicolor")
    return sorted(set(out))


def infer_pill_colors(
    alt: str,
    img_path: Path | None,
    avg_hex: str,
) -> tuple[list[str], str]:
    clauses = pill_relevant_clauses(alt)
    from_alt = extract_pill_colors_from_clauses(clauses)
    if from_alt:
        return from_alt, "alt_text"

    if not has_pill_subject(alt):
        hx = hex_to_rgb(avg_hex)
        if hx:
            fam = rgb_to_color_family(*hx)
            return [family_to_pill_label(fam)], "avg_color_only_no_pill_clause"
        return [], "none"

    if img_path and img_path.is_file():
        try:
            ctr = sample_center_crop_colors(img_path)
            guessed = dominant_pill_colors_from_image(ctr)
            if guessed:
                return guessed, "image_center_crop"
        except OSError:
            pass

    hx = hex_to_rgb(avg_hex)
    if hx:
        return [family_to_pill_label(rgb_to_color_family(*hx))], "avg_color_fallback"
    return [], "none"


def infer_pill_shapes(alt: str) -> tuple[list[str], str]:
    shapes = extract_pill_shapes(alt)
    if shapes:
        return shapes, "alt_text"
    if has_pill_subject(alt):
        return ["unspecified_pill_shape"], "pill_mentioned_shape_not_parsed"
    return ["no_clear_pill_or_blister_subject"], "scene_not_pill_closeup"


def find_image_path(img_dir: Path, pid: str) -> Path | None:
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        p = img_dir / f"pexels_{pid}{ext}"
        if p.is_file():
            return p
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Pill/drug shape + colour analysis for Pexels export.")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    parser.add_argument("--img-dir", type=Path, default=DEFAULT_IMG_DIR)
    args = parser.parse_args()

    csv_path = args.csv if args.csv.is_absolute() else HERE / args.csv
    img_dir = args.img_dir if args.img_dir.is_absolute() else HERE / args.img_dir

    if not csv_path.is_file():
        raise SystemExit(f"Missing CSV: {csv_path}")

    rows_out: list[dict[str, str]] = []
    by_shape: dict[str, list[str]] = {}
    by_color: dict[str, list[str]] = {}

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            pid = str(row.get("id", "")).strip()
            if not pid.isdigit():
                continue
            alt = row.get("alt") or ""
            avg = row.get("avg_color") or ""

            img_path = find_image_path(img_dir, pid)
            pill_shapes, shape_src = infer_pill_shapes(alt)
            pill_colors, color_src = infer_pill_colors(alt, img_path, avg)

            for s in pill_shapes:
                by_shape.setdefault(s, []).append(pid)
            for c in pill_colors:
                by_color.setdefault(c, []).append(pid)

            shape_headers = " | ".join(
                f"Shape: {SHAPE_SECTION[s][0]}" if s in SHAPE_SECTION else f"Shape: ({s})"
                for s in pill_shapes
            )
            colour_headers = " | ".join(
                f"Colour: {COLOUR_SECTION[c][0]}" if c in COLOUR_SECTION else f"Colour: ({c})"
                for c in pill_colors
            )

            rows_out.append(
                {
                    "row_kind": "image",
                    "id": pid,
                    "local_image": img_path.name if img_path else "",
                    "shape_category_headers": shape_headers,
                    "colour_category_headers": colour_headers,
                    "pill_drug_shapes": ";".join(pill_shapes),
                    "pill_shape_source": shape_src,
                    "pill_drug_colours": ";".join(pill_colors),
                    "pill_colour_source": color_src,
                    "alt_excerpt": (alt[:140] + "…") if len(alt) > 140 else alt,
                    "avg_color_csv": avg,
                }
            )

    fieldnames = [
        "row_kind",
        "id",
        "local_image",
        "shape_category_headers",
        "colour_category_headers",
        "pill_drug_shapes",
        "pill_shape_source",
        "pill_drug_colours",
        "pill_colour_source",
        "alt_excerpt",
        "avg_color_csv",
    ]
    id_to_row = {r["id"]: r for r in rows_out}

    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows_out)
        pad = [""] * len(fieldnames)
        w2 = csv.writer(f)
        w2.writerow([])
        w2.writerow(
            [
                "SECTION",
                "",
                "",
                "Category index (same columns as above). row_kind=shape_group or colour_group.",
                "",
                "",
                "",
                "",
                "Members listed in alt_excerpt as id=… file=…",
                "image_count_for_category",
            ]
        )
        for tag in sorted(by_shape.keys()):
            ids = sorted(set(by_shape[tag]), key=int)
            title, _blurb = SHAPE_SECTION.get(
                tag,
                (tag.replace("_", " ").title(), ""),
            )
            members = " | ".join(
                f"id={i} file={id_to_row[i]['local_image']}"
                for i in ids
                if i in id_to_row
            )
            row = {
                "row_kind": "shape_group",
                "id": "",
                "local_image": "",
                "shape_category_headers": f"Shape: {title}",
                "colour_category_headers": "",
                "pill_drug_shapes": tag,
                "pill_shape_source": "",
                "pill_drug_colours": "",
                "pill_colour_source": "",
                "alt_excerpt": members,
                "avg_color_csv": str(len(ids)),
            }
            w2.writerow([row.get(h, "") for h in fieldnames])

        w2.writerow(pad)
        for tag in sorted(by_color.keys()):
            ids = sorted(set(by_color[tag]), key=int)
            title, _blurb = COLOUR_SECTION.get(
                tag,
                (tag.replace("_", " ").title(), ""),
            )
            members = " | ".join(
                f"id={i} file={id_to_row[i]['local_image']}"
                for i in ids
                if i in id_to_row
            )
            row = {
                "row_kind": "colour_group",
                "id": "",
                "local_image": "",
                "shape_category_headers": "",
                "colour_category_headers": f"Colour: {title}",
                "pill_drug_shapes": "",
                "pill_shape_source": "",
                "pill_drug_colours": tag,
                "pill_colour_source": "",
                "alt_excerpt": members,
                "avg_color_csv": str(len(ids)),
            }
            w2.writerow([row.get(h, "") for h in fieldnames])

    def image_bullets(ids: list[str]) -> list[str]:
        bullets: list[str] = []
        for pid in ids:
            r = id_to_row.get(pid, {})
            fn = r.get("local_image") or f"(file missing for id {pid})"
            ex = (r.get("alt_excerpt") or "").replace("\n", " ").strip()
            if len(ex) > 100:
                ex = ex[:97] + "…"
            tail = f" — _{ex}_" if ex else ""
            bullets.append(f"- **`{fn}`** — Pexels photo ID **{pid}**{tail}")
        return bullets

    lines = [
        "# Pill shape and colour categorization",
        "",
        "This document groups the **50 exported Pexels images** by **pill or drug shape** and by **pill or drug colour**.",
        "Rules use the photo caption (`alt`) where possible, strip many “on a … background” tails for colour, and use a **centre crop** of the JPEG when the caption does not name colours but still describes pills.",
        "The same image can appear under **more than one** heading when it matches several tags (for example blister pack **and** red capsules).",
        "",
        "---",
        "",
        "## Part 1 — Shape categories",
        "",
        "Each subsection is one **shape** group. Under the header you will find **which images** belong in that category.",
        "",
    ]
    for tag in sorted(by_shape.keys()):
        ids = sorted(set(by_shape[tag]), key=int)
        title, blurb = SHAPE_SECTION.get(
            tag,
            (tag.replace("_", " ").title(), "Shape tag from caption keywords and rules in `analyze_pexels_shape_color.py`."),
        )
        lines.append(f"### Shape: {title}")
        lines.append("")
        lines.append(f"_Machine tag: `{tag}` — {len(ids)} image(s)._")
        lines.append("")
        lines.append(blurb)
        lines.append("")
        lines.append("**These images are in this shape category:**")
        lines.append("")
        lines.extend(image_bullets(ids))
        lines.append("")

    lines.extend(
        [
            "---",
            "",
            "## Part 2 — Colour categories",
            "",
            "Each subsection is one **pill or drug colour** group (or multicolour). Under the header you will find **which images** were tagged with that colour.",
            "",
        ]
    )
    for tag in sorted(by_color.keys()):
        ids = sorted(set(by_color[tag]), key=int)
        title, blurb = COLOUR_SECTION.get(
            tag,
            (tag.replace("_", " ").title(), "Colour tag from caption tokens or centre-crop hues."),
        )
        lines.append(f"### Colour: {title}")
        lines.append("")
        lines.append(f"_Machine tag: `{tag}` — {len(ids)} image(s)._")
        lines.append("")
        lines.append(blurb)
        lines.append("")
        lines.append("**These images are in this colour category:**")
        lines.append("")
        lines.extend(image_bullets(ids))
        lines.append("")

    OUT_MD.write_text("\n".join(lines), encoding="utf-8")
    n_extra = 1 + len(by_shape) + 1 + len(by_color)  # section + shapes + blank + colours
    print(f"Wrote {OUT_CSV} ({len(rows_out)} image rows + {n_extra} category index rows)")
    print(f"Wrote {OUT_MD}")


if __name__ == "__main__":
    main()
