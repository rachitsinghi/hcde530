#!/usr/bin/env python3
"""Convert a markdown file to a styled PDF via headless Chrome."""

from __future__ import annotations

import html
import re
import subprocess
import sys
from pathlib import Path

CSS = """
@page {
  size: letter;
  margin: 1in 1.05in 1in 1.05in;
}

* { box-sizing: border-box; }

body {
  font-family: "Georgia", "Times New Roman", serif;
  font-size: 11pt;
  line-height: 1.55;
  color: #1a1a1a;
  max-width: 6.5in;
  margin: 0 auto;
}

h1 {
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-size: 22pt;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 0.35em;
  line-height: 1.2;
}

.subtitle {
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-size: 11pt;
  color: #555;
  margin: 0 0 1.75em;
  padding-bottom: 0.75em;
  border-bottom: 2px solid #222;
}

h2 {
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-size: 14pt;
  font-weight: 700;
  margin: 1.75em 0 0.65em;
  padding-top: 0.25em;
  color: #111;
  page-break-after: avoid;
}

h2:first-of-type { margin-top: 0.5em; }

p {
  margin: 0 0 0.85em;
  text-align: left;
  orphans: 3;
  widows: 3;
}

hr {
  border: none;
  border-top: 1px solid #ccc;
  margin: 1.5em 0;
}

strong {
  font-weight: 700;
}

code, .path {
  font-family: "Menlo", "Consolas", "Courier New", monospace;
  font-size: 0.88em;
  background: #f4f4f4;
  padding: 0.08em 0.28em;
  border-radius: 3px;
  word-break: break-word;
}

a {
  color: #1a5276;
  text-decoration: none;
}

.where-to-look {
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-size: 10pt;
  background: #f8f8f8;
  border-left: 3px solid #444;
  padding: 0.65em 0.85em;
  margin: 0.5em 0 1em;
  line-height: 1.5;
}

.learned {
  margin-top: 0.75em;
  padding-top: 0.5em;
}
"""


def inline_format(text: str) -> str:
    text = html.escape(text)
    text = re.sub(
        r"`([^`]+)`",
        r'<code>\1</code>',
        text,
    )
    text = re.sub(
        r"\*\*([^*]+)\*\*",
        r"<strong>\1</strong>",
        text,
    )
    text = re.sub(
        r"(?<![\"'>])(https?://[^\s<]+)",
        r'<a href="\1">\1</a>',
        text,
    )
    return text


def markdown_to_html(md: str) -> str:
    lines = md.splitlines()
    parts: list[str] = []
    i = 0

    if i < len(lines) and lines[i].startswith("# "):
        parts.append(f"<h1>{html.escape(lines[i][2:].strip())}</h1>")
        i += 1
        if i < len(lines) and lines[i].strip() and not lines[i].startswith("#"):
            parts.append(f'<p class="subtitle">{html.escape(lines[i].strip())}</p>')
            i += 1

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        if stripped == "---":
            parts.append("<hr>")
            i += 1
            continue

        if stripped.startswith("## "):
            parts.append(f"<h2>{html.escape(stripped[3:].strip())}</h2>")
            i += 1
            continue

        if stripped.startswith("**Where to look:**"):
            body = stripped[len("**Where to look:**") :].strip()
            parts.append(
                f'<p class="where-to-look"><strong>Where to look:</strong> '
                f"{inline_format(body)}</p>"
            )
            i += 1
            continue

        if stripped.startswith("**What this demonstrates"):
            para_lines = [stripped]
            i += 1
            while i < len(lines) and lines[i].strip() and lines[i].strip() != "---":
                if lines[i].startswith("## "):
                    break
                para_lines.append(lines[i].strip())
                i += 1
            text = " ".join(para_lines)
            parts.append(f'<p class="learned">{inline_format(text)}</p>')
            continue

        para_lines = [stripped]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if (
                not nxt
                or nxt == "---"
                or nxt.startswith("## ")
                or nxt.startswith("**Where to look:**")
                or nxt.startswith("**What this demonstrates")
            ):
                break
            para_lines.append(nxt)
            i += 1
        parts.append(f"<p>{inline_format(' '.join(para_lines))}</p>")

    body = "\n".join(parts)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>End-of-Quarter Reflection</title>
  <style>{CSS}</style>
</head>
<body>
{body}
</body>
</html>
"""


def find_chrome() -> str:
    candidates = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ]
    for path in candidates:
        if Path(path).is_file():
            return path
    raise SystemExit("Could not find Chrome, Chromium, or Edge for PDF export.")


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(f"Usage: {sys.argv[0]} <input.md> [output.pdf]")

    src = Path(sys.argv[1]).resolve()
    if not src.is_file():
        raise SystemExit(f"File not found: {src}")

    out = (
        Path(sys.argv[2]).resolve()
        if len(sys.argv) > 2
        else src.with_suffix(".pdf")
    )

    html_path = out.with_suffix(".html")
    html_path.write_text(markdown_to_html(src.read_text(encoding="utf-8")), encoding="utf-8")

    chrome = find_chrome()
    cmd = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={out}",
        html_path.as_uri(),
    ]
    subprocess.run(cmd, check=True, capture_output=True)

    print(f"Wrote {out}")
    print(f"Source HTML: {html_path}")


if __name__ == "__main__":
    main()
