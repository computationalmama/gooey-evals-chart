# Adding a chart

**Full illustrated guide:** https://claude.ai/code/artifact/bdc570bb-b660-4490-b35f-7a8746e3693c

There are two ways to make a chart. **The chart maker is the easy one** — start there.

## The easy way: the chart maker

1. Open **<https://computationalmama.github.io/gooey-evals-chart/>**. That is the whole setup — there is nothing to install.
   (If you have the folder on your computer instead, double-click
   **`Chart maker.command`** and it opens the same page.)
2. Copy your results out of Google Sheets or Excel and paste them into the big box.
   Pasting straight from a spreadsheet works; you do not have to save a CSV first.
   You can also drag a `.csv` file onto the box, or use **Choose file**.
3. Fill in the **Title**, **Date** and **Byline** boxes. Pick the country for the
   background pattern. Leave the axes on **Auto** unless you want to pin them.
4. The chart appears as you type. **Read the build report underneath it** and check
   *Fastest* and *Most accurate* against your own numbers — that is the whole point of
   this tool, and catching a wrong one there saves a wrong chart going out.
5. Download what you need:
   - **PNG** — the image for slides, social and partner reports.
   - **Standalone HTML** — the file for the website.
   - **Webflow embed** — paste-into-Webflow version, if you are not hosting a file.
   - **CSV** — the tidied-up version of your data, worth keeping.

Your data never leaves your computer. The first chart you make needs an internet
connection (it downloads the fonts), after which it works offline.

If the report shows a red **fail**, the chart is wrong — the message says what to change.
The commonest one is a number falling outside the axis range; either widen the axis or
tick **Auto**.

## The repo way: a CSV in this folder

Use this when the chart should live in the repo and be rebuilt later.

### Steps

1. Copy `_TEMPLATE.csv`, rename it `language-date.csv` (e.g. `swahili-2026-09-01.csv`).
   Lowercase, hyphens, no spaces — **the filename becomes the web address**.
2. Open it in Excel / Numbers / Sheets. Edit the `#` lines at the top, then replace the
   data rows with the eval results.
3. Save, keeping CSV format (in Excel choose **CSV UTF-8**).
4. Double-click **`Make charts.command`** in the folder above this one.
5. Finished files appear in `../dist/` — `.html` for the website, `@2x.png` for slides.

Filenames starting with `_` are ignored, so `_draft-hausa.csv` can sit here unbuilt.

## The file

```csv
# title: Swahili Evaluation of Audio AI Models
# country: KE
# byline: Gooey.AI, ClearGlobal and the Gates Foundation
# date: 2026-09-01
# url: Gooey.AI/language
# x: Accuracy, 0, 1, 0.1
# y: Latency, 0, 35, 5
Workflow,Accuracy (mean),Latency (median)
GPT 5.6 Sol,0.27,14.60
Claude Fable 5 + Intron,0.68,17.76
```

**Required:** `title`, `date`, `byline`. Everything else is optional.

- `country` — background pattern: `NG`, `KE`, `RW`, `IN`. Anything else → soft dot grid.
- `x` / `y` — `name, lowest, highest, gap`. **Delete both lines to auto-scale.** Keep them
  when charts must share a scale for side-by-side comparison.
- `xnote` / `ynote` — corner hints; default `More accurate` / `Lower is better`.
- `date` — write `2026-09-01`; prints as `1 Sep 2026` and sets the footer © year.
- `byline` — text before the first comma is bolded.

**Columns** just have to *contain* Workflow, Accuracy and Latency, in any order. Extra
columns are ignored. Row order sets the numbers printed in the dots, starting at 0.

`Fastest` and `Most Accurate` are computed from the data — never typed in — so they can't
land on the wrong point. Equal accuracy always aligns exactly on the x-axis.

## Common messages

| Message | Fix |
|---|---|
| `missing a "Accuracy" column` | Heading misspelled; the message lists what it found |
| `not a number` | Stray character in a cell — often `0,27` instead of `0.27`, or `n/a` |
| `no data rows` | Table empty, or the headings row is missing |
| `no logo for "…"` | Harmless; charts without a logo. Ask a developer to add the mark |
| `the plot is getting crowded` | Too many workflows to place cleanly; consider splitting |
| `could not fetch … subset` | New wording needs one online build, then it's cached |

## Webflow

Every build also writes `../dist/<name>.embed.html`. Paste its entire contents into a
Webflow **Embed** element — no hosting needed. The build says whether it fits Webflow's
size limit. (A developer may prefer the iframe route; ask them.)

A bad CSV stops the build — it never publishes a broken chart, and the previous `.html`
stays untouched until a build succeeds.
