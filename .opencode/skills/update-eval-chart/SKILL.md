---
name: update-eval-chart
description: Turn language-evaluation data supplied in chat—screenshots, pasted tables, CSV rows, or corrections—into a validated Gooey.AI accuracy-versus-latency chart, preserve the dated CSV snapshot, and prepare or update the chart PR. Use this whenever someone asks to add, regenerate, correct, publish, or update an evaluation chart, even if they only paste evaluator screenshots or say that Mean is accuracy and Median is latency.
compatibility: OpenCode with Python 3, Node.js 18+, Chrome/Chromium, git, and GitHub CLI
---

# Update a Gooey evaluation chart

Convert chat-supplied results into one canonical CSV and deterministic chart. Keep the data review separate from publishing: the numbers and any page-copy changes need explicit approval before files change.

## Source of truth

Work in the `gooey-evals-chart` repository. Read `CLAUDE.md` before changing chart code. The renderer is deterministic and generated output in `dist/` must never be hand-edited.

Expected repository files:

- `charts/<language>-<YYYY-MM-DD>.csv` — immutable source snapshot
- `dist/<language>-<YYYY-MM-DD>.html` — generated interactive chart
- `dist/<language>-<YYYY-MM-DD>@2x.png` — generated retina image

The merged chart is published by GitHub Pages at:

`https://computationalmama.github.io/gooey-evals-chart/charts/<language>-<YYYY-MM-DD>.html`

## Workflow

### 1. Sync safely

Before reading files or editing:

1. Run `git status --short --branch`.
2. Preserve unrelated changes; never reset or discard them.
3. Run `git pull --ff-only`.
4. For a PR, create a focused branch or clean worktree rather than mixing unrelated work.

### 2. Normalize the chat input

Accept any combination of:

- screenshots of evaluator results,
- pasted Markdown or plain-text tables,
- CSV rows or an attached CSV,
- written corrections to an existing snapshot.

Extract one row per workflow with exactly:

- workflow name,
- accuracy,
- latency.

Unless the user says otherwise, treat evaluator **Mean as accuracy** and **Median as latency**. Preserve displayed precision; do not invent hidden digits from a screenshot. Never infer an unreadable cell—ask for that value.

Collect or infer only when unambiguous:

- language and filename slug,
- evaluation date in `YYYY-MM-DD`,
- ISO-2 country code,
- title,
- byline and display URL,
- optional fixed axis ranges.

Prefer omitting `# x:` and `# y:` so the renderer auto-scales. Keep fixed axes when the user wants comparable charts or an existing series deliberately shares a scale.

### 3. Present a pre-change approval block

Before modifying any chart, show:

1. proposed filename and metadata,
2. a compact workflow/accuracy/latency table,
3. computed most-accurate and fastest workflow(s), including ties,
4. any page text that should change because an older date, model list, or conclusion is now stale,
5. ambiguities or unreadable values.

End with an explicit approval request. Do not edit, build, commit, push, deploy, or alter related page copy until the user approves the normalized data.

Corrections after approval require another approval block if they change a number, date, workflow, chart conclusion, or related page text.

### 4. Save an immutable snapshot

After approval, create `charts/<language>-<YYYY-MM-DD>.csv` using this shape:

```csv
# title: Hausa Evaluation of Audio AI Models
# country: NG
# byline: Gooey.AI, CLEAR Global and the Gates Foundation
# date: 2026-08-30
# url: Gooey.AI/language
Workflow,Accuracy (mean),Latency (median)
Gemini 3.1 Pro,0.71,16.33
```

Use lowercase hyphenated filenames. Do not overwrite or delete a prior dated snapshot. If the same language and date already exists with different data, stop and ask whether the date is wrong or a corrected snapshot policy is needed.

### 5. Build and validate

Find a usable browser in this order:

1. existing `$CHROME`,
2. Google Chrome,
3. Chromium or Brave,
4. Puppeteer's `chrome-headless-shell` cache.

Run the bundled helper, which builds only the requested CSV, exports its PNG, and validates metadata, row counts, winner calculations, SVG structure, and output dimensions:

```bash
python3 .opencode/skills/update-eval-chart/scripts/build_and_validate.py \
  charts/<language>-<YYYY-MM-DD>.csv
```

The helper prints the resolved browser and a compact JSON summary. A renderer warning about an unmapped logo may be reported, but a build failure, overlap failure, missing output, mismatched winners, or bad PNG size blocks publishing.

Also run the repository tests when chart code or shared assets changed:

```bash
CHROME="<resolved browser>" node build.mjs tests/*.csv
npm run verify
```

For a data-only chart addition, the targeted helper plus existing CI is sufficient.

### 6. Review the result

Open `dist/<slug-date>.html` in a browser and check:

- title, date, byline, and country motif,
- every workflow appears once,
- fastest and most-accurate badges match the approved table,
- labels are readable and unclipped,
- hover behavior works,
- the PNG exists and is `2826 × 1504` at the default 2× export.

Summarize the build result to the user, including fastest, most accurate, warnings, and paths. If related website prose is stale, propose its exact replacement and obtain approval before changing it.

### 7. PR and production publishing

Do not push merely because the chart built. When the user asks to make the PR:

1. commit the new dated CSV and any required cached font assets,
2. do not commit `dist/` (it is generated and ignored),
3. push the focused branch,
4. open a PR against `main`,
5. include the source date, row count, fastest, most accurate, and validation status in the PR body.

Merging to `main` triggers GitHub Pages and publishes generated HTML under `/charts/*`. Never bypass review by pushing directly to `main`. After merge, verify the exact production chart URL returns successfully and contains the expected title and number of points.

If the chart must also be embedded on another site, make that a separate approved change. Embed only the latest chart initially; historical chart HTML files can remain archived without loading. A history selector should assign an iframe `src` only after a visitor chooses a dated snapshot, so archive growth does not increase initial page weight.

## Final response

Report:

- snapshot path and evaluation date,
- number of workflows,
- fastest and most accurate workflow(s),
- validation result and warnings,
- PR URL if created,
- production `/charts/*` URL only after merge and verification,
- any approved website-copy update that remains separate.
