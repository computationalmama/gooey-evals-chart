#!/usr/bin/env python3
"""Build and validate one Gooey evaluation chart CSV."""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import struct
import subprocess
import sys
from pathlib import Path


REQUIRED_META = ("title", "date", "byline")


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


def chrome_candidates() -> list[str]:
    candidates: list[str | None] = [os.environ.get("CHROME")]
    home = Path.home()
    candidates.extend(
        str(path)
        for path in sorted(
            (home / ".cache" / "puppeteer" / "chrome-headless-shell").glob(
                "**/chrome-headless-shell"
            ),
            reverse=True,
        )
    )
    candidates.extend(
        [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
            shutil.which("google-chrome"),
            shutil.which("chromium"),
            shutil.which("chromium-browser"),
            shutil.which("brave-browser"),
        ]
    )
    resolved: list[str] = []
    for candidate in candidates:
        if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
            path = str(Path(candidate).resolve())
            if path not in resolved:
                resolved.append(path)
    if not resolved:
        fail("No Chrome, Chromium, Brave, or Puppeteer chrome-headless-shell executable found")
    return resolved


def parse_snapshot(path: Path) -> tuple[dict[str, str], list[dict[str, object]]]:
    metadata: dict[str, str] = {}
    table_lines: list[str] = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if line.startswith("#"):
            match = re.match(r"^#\s*([^:]+):\s*(.*?)\s*$", line)
            if match:
                metadata[match.group(1).strip().lower()] = match.group(2).strip()
        elif line.strip():
            table_lines.append(line)

    missing = [key for key in REQUIRED_META if not metadata.get(key)]
    if missing:
        fail(f"Missing required metadata: {', '.join(missing)}")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", metadata["date"]):
        fail("Metadata date must use YYYY-MM-DD")
    if metadata["date"] not in path.stem:
        fail(f"Filename {path.name!r} must include metadata date {metadata['date']}")
    if not table_lines:
        fail("CSV has no table")

    reader = csv.DictReader(table_lines)
    fields = reader.fieldnames or []

    def column(fragment: str) -> str:
        matches = [field for field in fields if fragment in field.lower()]
        if len(matches) != 1:
            fail(f"Expected one {fragment!r} column; found {matches or fields}")
        return matches[0]

    workflow_col = column("workflow")
    accuracy_col = column("accuracy")
    latency_col = column("latency")
    rows: list[dict[str, object]] = []
    seen: set[str] = set()
    for index, raw in enumerate(reader, start=1):
        name = (raw.get(workflow_col) or "").strip()
        if not name:
            fail(f"Row {index} has no workflow name")
        if name in seen:
            fail(f"Duplicate workflow: {name}")
        seen.add(name)
        try:
            accuracy = float((raw.get(accuracy_col) or "").strip())
            latency = float((raw.get(latency_col) or "").strip())
        except ValueError:
            fail(f"Row {index} has a non-numeric accuracy or latency")
        if not 0 <= accuracy <= 1:
            fail(f"Accuracy for {name} must be between 0 and 1")
        if latency < 0:
            fail(f"Latency for {name} cannot be negative")
        rows.append({"name": name, "accuracy": accuracy, "latency": latency})
    if not rows:
        fail("CSV has no data rows")
    return metadata, rows


def winners(rows: list[dict[str, object]], key: str, mode: str) -> list[str]:
    values = [float(row[key]) for row in rows]
    target = min(values) if mode == "min" else max(values)
    return [str(row["name"]) for row in rows if float(row[key]) == target]


def png_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()[:24]
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        fail(f"{path} is not a PNG")
    return struct.unpack(">II", data[16:24])


def run(command: list[str], cwd: Path, env: dict[str, str]) -> str:
    process = subprocess.run(command, cwd=cwd, env=env, text=True, capture_output=True)
    output = "\n".join(part for part in (process.stdout, process.stderr) if part).strip()
    if output:
        print(output)
    if process.returncode:
        fail(f"Command failed ({process.returncode}): {' '.join(command)}")
    return output


def build_with_browser_fallback(
    command: list[str], cwd: Path, base_env: dict[str, str], browsers: list[str]
) -> tuple[str, str, dict[str, str]]:
    for index, browser in enumerate(browsers):
        env = base_env.copy()
        env["CHROME"] = browser
        print(f"Using browser: {browser}")
        process = subprocess.run(command, cwd=cwd, env=env, text=True, capture_output=True)
        output = "\n".join(part for part in (process.stdout, process.stderr) if part).strip()
        if output:
            print(output)
        if process.returncode == 0:
            return output, browser, env
        has_fallback = index + 1 < len(browsers)
        if has_fallback and "renderer produced no SVG" in output:
            print("Renderer produced no SVG; trying the next available browser.")
            continue
        fail(f"Command failed ({process.returncode}): {' '.join(command)}")
    fail("No available browser could build the chart")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--skip-png", action="store_true")
    args = parser.parse_args()

    repo = Path.cwd().resolve()
    csv_path = args.csv_path.resolve()
    try:
        relative_csv = csv_path.relative_to(repo)
    except ValueError:
        fail("CSV must be inside the current repository")
    if relative_csv.parent != Path("charts"):
        fail("Snapshot must live directly under charts/")

    metadata, rows = parse_snapshot(csv_path)
    expected_fastest = winners(rows, "latency", "min")
    expected_accurate = winners(rows, "accuracy", "max")
    build_output, chrome, env = build_with_browser_fallback(
        ["node", "build.mjs", str(relative_csv)], repo, os.environ.copy(), chrome_candidates()
    )
    chart_name = csv_path.stem
    html_path = repo / "dist" / f"{chart_name}.html"
    if not html_path.is_file():
        fail(f"Missing generated HTML: {html_path}")
    html = html_path.read_text(encoding="utf-8")
    if f"<title>{metadata['title']}</title>" not in html:
        fail("Generated HTML title does not match CSV metadata")
    pill_count = len(re.findall(r'class="gc-pill"', html))
    dot_count = len(re.findall(r'class="gc-dot"', html))
    if pill_count != len(rows) or dot_count != len(rows):
        fail(
            f"Generated point count mismatch: rows={len(rows)}, pills={pill_count}, dots={dot_count}"
        )
    if "0 overlapping pairs" not in build_output:
        fail("Build report did not confirm zero overlapping labels")
    fastest_line = next(
        (line for line in build_output.splitlines() if line.strip().startswith("fastest")), ""
    )
    accurate_line = next(
        (line for line in build_output.splitlines() if line.strip().startswith("most accurate")), ""
    )
    for winner_name in expected_fastest:
        if not re.search(rf"#[0-9]+ {re.escape(winner_name)} \(", fastest_line):
            fail(f"Build report fastest winner does not include {winner_name}")
    for winner_name in expected_accurate:
        if not re.search(rf"#[0-9]+ {re.escape(winner_name)} \(", accurate_line):
            fail(f"Build report accuracy winner does not include {winner_name}")

    png_path = repo / "dist" / f"{chart_name}@2x.png"
    dimensions = None
    if not args.skip_png:
        run(["node", "export-png.mjs", str(html_path.relative_to(repo))], repo, env)
        if not png_path.is_file():
            fail(f"Missing generated PNG: {png_path}")
        dimensions = png_dimensions(png_path)
        if dimensions != (2826, 1504):
            fail(f"Unexpected 2x PNG dimensions: {dimensions[0]}x{dimensions[1]}")

    summary = {
        "snapshot": str(relative_csv),
        "date": metadata["date"],
        "workflows": len(rows),
        "fastest": expected_fastest,
        "most_accurate": expected_accurate,
        "html": str(html_path.relative_to(repo)),
        "png": None if args.skip_png else str(png_path.relative_to(repo)),
        "png_dimensions": dimensions,
        "browser": chrome,
    }
    print("VALIDATION SUMMARY")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
