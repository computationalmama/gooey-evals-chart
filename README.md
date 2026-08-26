# Gooey.AI language-eval charts

Deterministic, embeddable versions of the language-evaluation infographics for
`Gooey.AI/language`. One CSV in, one self-contained HTML file out (plus a 2× PNG).

Replaces generating the chart as an AI image. Same visual language, but the numbers are
now actually plotted: ties land on the same x pixel, `Fastest`/`Most Accurate` are
computed from the data, and nothing gets clipped.

**Chart maker → <https://computationalmama.github.io/gooey-evals-chart/>** — paste a CSV, get the chart, download the 2× PNG.
Nothing to install, nothing uploaded; it runs entirely in your browser.

There are two ways in, both driving the same renderer:

| | Use it when | How |
|---|---|---|
| **Chart maker** | you have a CSV and want a chart now | [the hosted page](https://computationalmama.github.io/gooey-evals-chart/) |
| **CLI** | the chart should live in this repo | `node build.mjs` |

## Quick start — the chart maker

It is already hosted: **<https://computationalmama.github.io/gooey-evals-chart/>**. To work on it locally instead:

```bash
npm run open              # builds dist/app.html and opens it
```

`dist/app.html` is one self-contained static file. Paste or drop a CSV, set the titles in
form fields, and download the 2× PNG, the standalone HTML, the Webflow embed or the
canonical CSV. Everything runs in your browser — nothing is uploaded. Non-technical
teammates can double-click **`Chart maker.command`** instead.

GitHub Pages serves it from this repo — `.github/workflows/pages.yml` rebuilds and
redeploys on every push to `main`, and also publishes each built chart under
[`/charts/`](https://computationalmama.github.io/gooey-evals-chart/charts/) so the iframe embed URLs resolve. To host it anywhere else,
copy that one file; there is no build step, server, or Chrome needed at run time.

## Quick start — the CLI

```bash
node build.mjs            # charts/*.csv -> dist/*.html  (+ dist/index.html gallery)
node export-png.mjs       # dist/*.html  -> dist/*@2x.png
open dist/index.html      # review everything locally
npm run verify            # assert the app and the CLI produce identical SVG
```

No `npm install` — there are no dependencies. Requirements: Node 18+, and Google Chrome
(used headlessly to measure text and to render PNGs). Override its location with
`CHROME=/path/to/chrome`.

For non-technical teammates there are two double-clickable files: **`Chart maker.command`**
(opens the browser app) and **`Make charts.command`** (rebuilds every chart in `charts/`).
See [`charts/README.md`](charts/README.md) and the
[illustrated guide](https://claude.ai/code/artifact/bdc570bb-b660-4490-b35f-7a8746e3693c).

The two paths are held together by `node verify-app.mjs`, which drives `dist/app.html` in
headless Chrome and asserts its SVG is byte-identical to the CLI's. Run `npm run verify`
after changing anything in `src/`.

## Renewing an eval

1. Copy `charts/_TEMPLATE.csv` and edit it, or edit an existing chart.
2. `node build.mjs && node export-png.mjs` — or double-click `Make charts.command`.
3. Replace the file on the host. The embed URL does not change.

Files in `charts/` whose name starts with `_` are skipped, so the template and any drafts
sit there unbuilt.

## Adding a new language

Drop in `charts/<language>-<date>.csv`. Set `# country:` to an ISO-3166 alpha-2 code to
pick the margin motif (`assets/motifs/<CC>.svg`, falling back to `default.svg`). Fonts
are subset per chart from the exact glyphs used, so non-Latin titles work with no extra
setup — the first build of new text needs network access, then it is cached.

## CSV format

A `#` metadata block, then a normal table. Sheets and Excel both open this as-is.

```csv
# title: Yoruba Evaluation of Audio AI Models
# country: NG
# byline: Gooey.AI, ClearGlobal and the Gates Foundation
# date: 2026-08-13
# url: Gooey.AI/language
# x: Accuracy, 0, 1, 0.1
# y: Latency, 0, 35, 5
Workflow,Accuracy (mean),Latency (median)
GPT 5.6 Sol,0.27,14.60
Claude Fable 5 + Intron,0.68,17.76
```

| Key | Notes |
|---|---|
| `title` | Set in Domine 700, centred |
| `country` | ISO-2, selects the margin motif. Optional |
| `byline` | The first comma-separated part is bolded (`Gooey.AI`) |
| `date` | `YYYY-MM-DD`, rendered as `13 Aug 2026`; also sets the footer `©` year |
| `url` | Trailing text in the byline |
| `x` / `y` | `name, min, max, step`. **Omit entirely to auto-scale** to nice round ticks |
| `xnote` / `ynote` | Default `More accurate` / `Lower is better` |

Column names are matched loosely, so `Accuracy (mean)` and `Latency (median)` work.
Row order sets the number printed inside each point.

## Embedding

```html
<iframe src="/charts/yoruba-2026-08-13.html"
        style="width:100%;aspect-ratio:1413/752;border:0"
        loading="lazy"
        title="Yoruba Evaluation of Audio AI Models"></iframe>
```

The fixed aspect ratio means no height negotiation is needed. The SVG has a `viewBox`, so
it stays sharp at any width.

`gooey.ai/language` is not served from `gooey-server` — unmatched paths are proxied to the
`gooey-static-pages` Cloudflare Pages repo (`routers/static_pages.py:26`,
`settings.CLOUDFLARE_PAGES_URL`). So the chart files belong next to that page, and
updating a chart needs **no `gooey-server` deploy**. If a Python-rendered page is ever
wanted instead, `gui.html()` takes raw HTML (see `daras_ai_v2/loom_video_widget.py:8` for
the existing responsive-iframe pattern).

## What the build guarantees

Every build re-derives these from the data and fails or warns rather than shipping quietly:

- **Equal accuracy ⇒ identical x pixel.** Structural, not best-effort.
- **`Fastest` / `Most Accurate` are computed** (`argmin` latency / `argmax` accuracy), with
  all ties highlighted. A tie spanning *every* point highlights nothing, since it
  distinguishes nothing.
- **Zero overlapping labels** — a hard failure if violated.
- **Nothing is clipped**; labels are confined to the plot plus the empty right-hand card margin.
- **Unmapped provider** → warning naming the workflow (it still renders, without a chip).
- **Crowding** → warning when leaders have to cross or pass through a label.
- **Byte-identical rebuilds.** The label solver is seeded, so `git diff` and PNG diffs are meaningful.

Example output:

```
yoruba-2026-08-13
  -> dist/yoruba-2026-08-13.html  (121.2 KB, fonts 29.8 KB, cached)
  fastest       #13 MiniMax M3 + Omni (10.52)
  most accurate #8 Claude Fable 5 + Intron (0.68)
  x-axis ties   0.27: #0,#13 · 0.57: #2,#12 · 0.61: #5,#10
  labels        15 placed, 0 overlapping pairs
  leaders       mean 27.9px, max 65.0px, 0 crossing, 0 through a label
```

## How it works

Label placement needs real text metrics, so `build.mjs` runs the renderer inside headless
Chrome and bakes the result. The output is therefore **static SVG that needs no
JavaScript** — the only script is a progressive-enhancement tooltip. With JS off, the SVG's
`<title>` elements still give native tooltips.

```
charts/*.csv ─► csv.js ─► [headless Chrome: layout.js + render.js] ─► static SVG
                                                                       │
                              fonts.js (per-chart woff2 subsets) ──────┤
                              assets.js (logos/icons/motif as data URIs) ─► template.js ─► dist/*.html
```

| File | Role |
|---|---|
| `src/tokens.js` | Palette + geometry, measured off the original infographic |
| `src/csv.js` | Metadata block + table parsing, auto axes, highlight computation |
| `src/providers.js` | Workflow name → provider logo chips |
| `src/layout.js` | Multi-start label solver + quality metrics |
| `src/render.js` | Data → SVG |
| `src/fonts.js` | Per-chart woff2 subsets, cached in `assets/fonts/cache/` |
| `src/assets.js` | Inlines logos, icons and the country motif |
| `src/template.js` | Final page, and the Chrome measurement harness |

### Label placement

Each label gets 24 directions × 7 distances of candidate slots. A cost function penalises
label overlap, covering a point, leaving the allowed area, and leader length. Because a
single greedy pass plus per-label refinement reliably lands in the *same* local optimum
regardless of weights, the solver restarts from 120 jittered orderings and picks the
winner by an explicit quality objective, in priority order:

> no clipping → no overlaps → no leader through a label → no leader crossings → short leaders

That is what took the reference chart's layout from 64px mean leaders with visible
crossings down to **28px with none**.

## Logos

`assets/logos/*.png` were extracted from the original infographic by
`tools/extract_logos.py` (`npm run logos`), in two modes:

- **tile** (OpenAI, Kimi, Anthropic, Intron) — the coloured tile is part of the mark. The
  solid block is auto-detected and given a rounded-corner mask.
- **bare** (Google, Meta, MiniMax, Gooey, 🧠, 🐇) — un-mixed off their background into
  straight alpha, so they don't show a white box on the teal highlight pills.

Source chips are ~26px and display at 22px, so 2× export upscales slightly. **To upgrade
any mark, drop a replacement into `assets/logos/` and point `logos.manifest.json` at it** —
nothing else needs to change. The 🐇 was taken off the teal `Fastest` pill rather than the
y-axis, because the y-axis one is white-on-white and mattes to almost nothing.

New providers: add a regex to `RULES` in `src/providers.js` and a matching asset.

To pull a mark out of a *new* infographic: `python3 tools/zoom.py x0 y0 x1 y1 scale out.png`
prints a magnified crop with a coordinate grid so you can read off the box, and
`tools/sheet.py` builds a multi-logo contact sheet. Add the box to `SPEC` in
`tools/extract_logos.py`, run `npm run logos`, then `python3 tools/verify_logos.py` to
check every mark on both white and the teal highlight.

## Tests

```bash
node build.mjs tests/*.csv
```

Covers the cases that break naive layout: 12 workflows at identical accuracy (worst-case
vertical stack), 25 workflows with a 38-character name and an unmapped provider, and a
single row with auto-scaled axes.

## Deliberate differences from the original image

- `Fastest` / `Most Accurate` badges sit **inside** the model's pill instead of floating
  as separate ones. Floating is what let `Most Accurate` fall off the right edge in the
  original. Reads the same, and removes two objects from the solver.
- The original marked `#4 MiniMax M3` (10.80s) as fastest. The actual fastest is
  `#13 MiniMax M3 + Omni` at 10.52s, and the build prints it every time.

## Not built (deliberately)

Portrait (752×1387) and OG/social presets, dark mode, and reading Bulk Runner output CSVs
directly. The token/preset split in `src/tokens.js` leaves room for the first two.
