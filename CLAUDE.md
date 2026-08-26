# evals-chart

Deterministic scatter charts of Gooey.AI language evaluations (Accuracy vs Latency),
published as self-contained HTML embedded on `Gooey.AI/language`, plus a 2× PNG.

Replaces generating these as AI images. **The numbers are plotted, not described** — ties
align exactly, `Fastest`/`Most Accurate` are computed, nothing is clipped.

Two front doors onto one renderer:

| | For | Entry point |
|---|---|---|
| **CLI** | charts that live in the repo and get committed | `node build.mjs` |
| **Chart maker** | a teammate with a CSV and no terminal | `dist/app.html` |

`dist/app.html` is a single self-contained file that runs the same modules in the
visitor's browser — paste a CSV, get the chart, the build report and the downloads.
`node verify-app.mjs` asserts the two produce **byte-identical** SVG, so neither path is
a second implementation to keep in step. If you change anything in `src/`, run it.

## Commands

```bash
node build.mjs                     # charts/*.csv -> dist/*.html + dist/index.html
node build.mjs charts/foo.csv      # just one
node export-png.mjs                # dist/*.html -> dist/*@2x.png
node build.mjs tests/*.csv         # edge-case suite
node build-app.mjs                 # web/ + src/ + assets/ -> dist/app.html (chart maker)
node verify-app.mjs                # assert the app's SVG == the CLI's, byte for byte
python3 tools/extract_logos.py     # re-extract logos from the reference image
python3 tools/verify_logos.py      # contact sheet: every logo on white AND teal
```

`npm run verify` runs build + build-app + parity in one go. Do that after touching
anything under `src/`.

No dependencies — do not add any. Node 18+ and Google Chrome (`CHROME=` to override path).

## Adding a new eval — the whole task

1. Create `charts/<language>-<YYYY-MM-DD>.csv`. **The filename becomes the embed URL**, so
   lowercase-with-hyphens. Copy `charts/_TEMPLATE.csv` as the starting point.
2. Fill in the `#` metadata block and the data rows (see spec below).
3. `node build.mjs && node export-png.mjs`
4. **Read the build report and confirm it against the source data** — specifically that
   `fastest` / `most accurate` name the rows you'd expect, and that `labels` says
   `0 overlapping pairs`. The build prints `ok` only if every assertion passed.

Report the fastest/most-accurate lines back to the user. They are the check that the data
landed correctly, and catching a wrong one is the whole point of this system.

## CSV spec

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

| Key | Required | Notes |
|---|---|---|
| `title` | yes | Domine 700, centred |
| `date` | yes | `YYYY-MM-DD` → `13 Aug 2026`; also sets the footer © year |
| `byline` | yes | Text before the first comma is bolded |
| `country` | no | ISO-2 → `assets/motifs/<CC>.svg`; ships `NG` `KE` `RW` `IN`, else `default.svg` |
| `url` | no | Trailing text in the byline |
| `x` / `y` | no | `name, min, max, step`. **Omit to auto-scale** to nice round ticks |
| `xnote` / `ynote` | no | Default `More accurate` / `Lower is better` |

Columns are matched loosely (exact → starts-with → contains), so `Accuracy (mean)`,
`Mean Accuracy` and `accuracy` all resolve. Extra columns are ignored. Row order sets the
number printed in each dot, from 0.

Files in `charts/` starting with `_` are skipped — that's how the template and drafts live
there unbuilt.

## Hard rules

- **Everything in `src/` except `fonts.js` and `assets.js` executes in the browser** — in
  the headless-Chrome harness for the CLI, and in the visitor's browser for
  `dist/app.html`. So `tokens.js`, `providers.js`, `layout.js`, `render.js`, `csv.js`,
  `checks.js` and `template.js` must stay free of `node:` imports, `fs` and `process`.
  Only `fonts.js`, `assets.js`, `build.mjs`, `build-app.mjs` and `verify-app.mjs` are
  Node-only. `assets.js` exports the pure `motifGroup()` for `build-app.mjs` to reuse.
- **The assertions live in `src/checks.js`, not in `build.mjs`.** Both front doors import
  `check()` from there, so a chart that fails on the CLI fails in the app with the same
  message. Add new assertions there.
- **Never introduce `Date.now()`, `Math.random()` or unseeded iteration** into the layout
  path. Builds must stay byte-identical; verify with
  `node build.mjs && shasum dist/*.html` twice.
- **Never hardcode which point is fastest or most accurate.** They come from
  `argmin(latency)` / `argmax(accuracy)` in `src/csv.js`, ties included. A tie spanning
  *every* point highlights nothing, deliberately.
- **Never hand-edit `dist/`.** It is generated; change the CSV or `src/` and rebuild.
- Don't relax the zero-overlap assertion to make a crowded chart pass. Crowding warns; use
  the warning.

## Layout

```
CLI:  charts/*.csv ─► csv.js ─► [headless Chrome: layout.js + render.js] ─► static SVG
                                  fonts.js (per-chart woff2 subsets) ──────┤
                                  assets.js (logos/icons/motif data URIs) ─┴─► template.js ─► dist/*.html

App:  pasted CSV ──► csv.js ─► [the visitor's browser: layout.js + render.js] ─► static SVG
                                  Google Fonts subsets, fetched live ────────┤
                                  logos/motifs baked into dist/app.html ─────┴─► template.js ─► download
```

Layout is baked at build time because placing labels needs real text metrics. Output is
therefore static SVG that renders with JS disabled; the only script is a tooltip.

| File | Role |
|---|---|
| `src/tokens.js` | Palette + geometry, measured off the original infographic. Change visual constants here |
| `src/csv.js` | Metadata + table parsing, auto axes, highlight computation |
| `src/checks.js` | The build assertions + glyph set + id namespacing, shared by both front doors |
| `src/providers.js` | Workflow name → provider logo chips |
| `src/layout.js` | Multi-start label solver, quality metrics |
| `src/render.js` | Data → SVG |
| `src/fonts.js` | Per-chart woff2 subsets, cached in `assets/fonts/cache/` |
| `src/assets.js` | Inlines logos, icons, motif |
| `src/template.js` | Final page + the Chrome measurement harness + the Webflow embed |
| `web/index.html`, `app.css`, `app.js` | The chart maker's UI, bundled into `dist/app.html` |
| `build-app.mjs` | Wraps the `src/` modules into one inlined script, bakes the assets |
| `verify-app.mjs` | Drives `dist/app.html` in headless Chrome and diffs against `dist/*.html` |

### Label solver

24 directions × 7 distances of candidate slots per label; cost penalises overlap, covering
a point, leaving bounds, and leader length. A single greedy pass plus per-label refinement
lands in the same local optimum regardless of weights, so it restarts from 120 jittered
orderings and picks the winner by an explicit quality objective, in priority order:

> no clipping → no overlaps → no leader through a label → no leader crossings → short leaders

That objective (in `solveLabels`) is the thing to tune, not the internal cost. Use the
build's `leaders mean/max, N crossing, N through a label` line as the metric.

## Adding a provider logo

1. Add a regex to `RULES` in `src/providers.js` (order matters — first match wins).
2. Add the asset. Either drop a file into `assets/logos/` and add it to
   `logos.manifest.json`, or add a crop box to `SPEC` in `tools/extract_logos.py` and run
   `python3 tools/extract_logos.py`.
   - `tile` mode = the coloured tile is part of the mark (OpenAI, Kimi, Anthropic, Intron).
   - `bare` mode = un-mixed off its background into straight alpha, so it doesn't show a
     white box on the teal highlight pills (Google, Meta, MiniMax, Gooey).
   - To find a crop box in a new source image: `python3 tools/zoom.py x0 y0 x1 y1 8 out.png`
     renders a magnified grid you can read coordinates off.
3. `python3 tools/verify_logos.py` — checks every mark on white **and** on the teal
   highlight. Any mark that shows a white box has the wrong mode.

An unmapped provider is not an error: it charts without a chip and the build warns, naming
the workflow.

## Fonts

Subset per chart from the exact glyphs used (~18KB vs ~161KB for full latin), so any
script works with no configuration. **First build of new text needs network access**, then
it is cached in `assets/fonts/cache/` — keep that directory committed so rebuilds are
offline. `Inter`'s latin subset lacks U+2192 (`→`), which is why the axis arrows are drawn
as SVG paths, not typed.

## Embedding

`gooey.ai/language` is **not** served by `gooey-server` — unmatched paths proxy to the
`gooey-static-pages` Cloudflare repo (`routers/static_pages.py:26`,
`settings.CLOUDFLARE_PAGES_URL`). Chart files belong next to that page; updating one needs
no `gooey-server` deploy.

```html
<iframe src="/charts/yoruba-2026-08-13.html"
        style="width:100%;aspect-ratio:1413/752;border:0"
        loading="lazy" title="Yoruba Evaluation of Audio AI Models"></iframe>
```

Fixed aspect ratio, so no height negotiation. If the user wants to avoid editing the page
on every renewal, suggest a stable filename (`yoruba.html`) with dated copies as archive.

### Webflow (and other CMS embed fields)

Webflow **cannot host a raw `.html` file** — Assets rejects it — and its HTML Embed
element caps at roughly 50,000 characters. So there are two routes:

**Preferred — iframe.** Host the `dist/*.html` anywhere (the `gooey-static-pages`
Cloudflare repo, GitHub Pages, Netlify), then paste the iframe above into a Webflow
**Embed** element. Immune to the host page's CSS, and updating means replacing one file.

**No-hosting fallback — paste the SVG.** Every build also writes
`dist/<name>.embed.html`: the same chart with fonts from Google Fonts instead of inlined
(to stay under the character limit), all styles scoped, ids and classes namespaced per
chart so two can share a page. Paste its whole contents into a Webflow **Embed** element.
The build prints the character count and whether it fits.

Because a pasted SVG lives in the host document, aggressive global CSS can still reach it
(`svg{}` rules, or element selectors like `rect{fill:...}`). Classes are prefixed `gc-`
and defensive resets are applied, which survives Webflow's normalize and typical site CSS
— but the iframe is the robust choice.


## The chart maker (`dist/app.html`)

One static file, ~104 KB, no server and no Chrome needed at run time. Deploy it by
copying it somewhere — the `gooey-static-pages` Cloudflare repo alongside the charts is
the natural home — or just double-click it (`Chart maker.command` builds and opens it).
It renders locally in the browser and uploads nothing.

What it gives a teammate: paste or drop a CSV, edit the titles and axes as form fields
rather than `#` lines, see the chart live, read the same build report the CLI prints, and
download the 2× PNG, the standalone HTML, the Webflow embed and the canonical CSV.

Four things about it are non-obvious:

- **`build-app.mjs` must escape `</script`, `<script` and `<!--`** before inlining the
  bundle. `template.js` holds those sequences inside template strings; left raw, the HTML
  tokenizer enters script-data-escaped state and tears the `<script>` apart, and the page
  dies with a `SyntaxError` far from the cause. A backslash before a non-escape character
  is dropped by JS, so the runtime strings are unchanged. There is an assertion for this.
- **Fonts are fetched at run time**, not baked in. Both Google Fonts endpoints send
  `access-control-allow-origin: *`, so the browser can do the same `&text=` subsetting
  `fonts.js` does on disk — which is what keeps the metrics, and therefore the layout,
  identical. Subsets are cached in `localStorage`, so only the first chart needs network.
  If the fetch fails the app links the fonts instead, says so in the report, and the
  embedded outputs (PNG, standalone HTML) are the ones that suffer.
- **The PNG is rasterised through a canvas**, by handing the SVG to an `<img>` at the
  exact target pixel size so the vector renders at full resolution. The font subsets have
  to be inside the SVG — an SVG loaded as an image may not fetch anything external. The
  result is the same size and content as `export-png.mjs` produces, but it is a different
  rasteriser, so bytes differ.
- **Tab handling lives in the app layer, not `csv.js`.** A Sheets paste is
  tab-separated, but a hand-aligned CSV writes `Workflow,\tAccuracy,\tLatency`. Treating
  that padding as a delimiter silently renames every workflow (`Gemini 3.1 Pro,`) — which
  is exactly what `verify-app.mjs` caught. The test is whether any tab stands clear of a
  comma, not whether tabs are present.

If you touch `src/`, run `npm run verify`. Nothing else guards the two front doors
against drifting apart.

## Non-technical teammates

`Chart maker.command` opens the browser app — that is the one to point a colleague at.
`Make charts.command` is the CLI equivalent: it rebuilds every chart in `charts/` and
opens the preview. `charts/README.md` is the plain-language version of this file. Keep it
in sync when the CSV format changes.

## Deliberately not built

Portrait (752×1387) and OG/social presets, dark mode for the chart itself, and reading
Bulk Runner output CSVs directly. The token/preset split in `src/tokens.js` leaves room
for the first two.
