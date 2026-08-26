#!/usr/bin/env node
// charts/*.csv -> dist/*.html  (self-contained, embeddable)
//
// Layout is baked at build time by running the renderer in headless Chrome, because
// placing labels needs real text metrics. The output is therefore static SVG that
// needs no JavaScript to display.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { parseChartCsv, formatDate } from "./src/csv.js";
import { loadAssets } from "./src/assets.js";
import { inlineFonts } from "./src/fonts.js";
import { page, harness, webflowEmbed } from "./src/template.js";
import { allText, namespaceIds, check } from "./src/checks.js";

const CHROME = process.env.CHROME ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SRC_MODULES = ["tokens.js", "providers.js", "layout.js", "render.js"];
const FONT_SPECS = [
  { family: "Domine", weight: 700 },
  { family: "Inter", weight: 400 },
  { family: "Inter", weight: 600 },
  { family: "Inter", weight: 700 },
];
const unesc = s => String(s).replace(/&quot;/g, '"').replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'");

function runChrome(file) {
  return execFileSync(CHROME, [
    "--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    "--allow-file-access-from-files", "--virtual-time-budget=15000",
    "--dump-dom", `file://${file}`,
  ], { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
}

async function buildOne(csvPath) {
  const name = basename(csvPath).replace(/\.csv$/i, "");
  const raw = readFileSync(csvPath, "utf8");
  const data = parseChartCsv(raw, basename(csvPath));
  data.date = formatDate(data.date);

  const assets = loadAssets(data.country);
  const chars = allText(data, data.date);
  const charsBySpec = new Map([
    ["Domine|700", data.title],
    ["Inter|400", chars],
    ["Inter|600", chars],
    ["Inter|700", chars],
  ]);
  const { css: fontCss, bytes: fontBytes, fetched } = await inlineFonts(FONT_SPECS, charsBySpec);

  const srcMap = {};
  for (const m of SRC_MODULES) srcMap[m] = readFileSync(join("src", m), "utf8");

  const tmp = join(tmpdir(), `evalchart-${name}-${process.pid}.html`);
  const h = harness({ fontCss, dataJson: JSON.stringify(data), srcMap })
    .replace("<script type=\"module\">",
      `<script>window.__ASSETS__=${JSON.stringify(assets)};</script>\n<script type="module">`);
  writeFileSync(tmp, h);

  let dom;
  try { dom = runChrome(tmp); } finally { rmSync(tmp, { force: true }); }

  const svg = /<script type="text\/plain" id="svgout">([\s\S]*?)<\/script>/.exec(dom)?.[1];
  if (!svg) throw new Error(`${name}: renderer produced no SVG (Chrome dump had no #svgout)`);
  const meta = /<div id="result"([^>]*)>/.exec(dom)?.[1] ?? "";
  const attr = k => unesc(new RegExp(`data-${k}="([^"]*)"`).exec(meta)?.[1] ?? "");
  const warnings = JSON.parse(attr("warnings") || "[]");
  const overlaps = JSON.parse(attr("overlaps") || '{"pairs":0,"total":0,"worst":0}');
  const leaders = JSON.parse(attr("leaders") || '{"mean":0,"max":0,"sum":0}');
  const crosses = JSON.parse(attr("crosses") || '{"leaderLeader":0,"leaderPill":0}');

  const html = page({
    title: data.title,
    description: `${data.title}. ${data.byline}${data.date ? " · " + data.date : ""}`,
    fontCss, svg: svg.trim(),
  });
  mkdirSync("dist", { recursive: true });
  const out = join("dist", `${name}.html`);
  writeFileSync(out, html);

  // paste-ready variant for Webflow / any CMS HTML-embed field
  const embed = webflowEmbed({
    svg: namespaceIds(svg.trim(), name.replace(/[^a-z0-9]+/gi, "")),
    slug: name.replace(/[^a-z0-9]+/gi, "-"),
    title: data.title,
  });
  const embedOut = join("dist", `${name}.embed.html`);
  writeFileSync(embedOut, embed);

  return { name, out, embedOut, data, warnings, overlaps, leaders, crosses, fontBytes, fetched,
           bytes: Buffer.byteLength(html), embedChars: embed.length };
}

// Assertions live in src/checks.js so the browser chart maker applies the same ones.

const args = process.argv.slice(2);
const files = (args.length ? args : readdirSync("charts").filter(f => /\.csv$/i.test(f) && !f.startsWith("_")).map(f => join("charts", f)));
if (!files.length) { console.error("no CSVs in charts/"); process.exit(1); }

let failed = 0;
const built = [];
for (const f of files) {
  try {
    const r = await buildOne(f);
    const { problems, ties, soft } = check(r);
    built.push(r);
    console.log(`\n${r.name}`);
    console.log(`  -> ${r.out}  (${(r.bytes / 1024).toFixed(1)} KB, fonts ${(r.fontBytes / 1024).toFixed(1)} KB${r.fetched ? `, ${r.fetched} fetched` : ", cached"})`);
    const f2 = r.data.fastest.map(i => `#${i} ${r.data.points[i].name} (${r.data.points[i].y})`);
    const a2 = r.data.accurate.map(i => `#${i} ${r.data.points[i].name} (${r.data.points[i].x})`);
    console.log(`  fastest       ${f2.join(", ")}`);
    console.log(`  most accurate ${a2.join(", ")}`);
    console.log(`  x-axis ties   ${ties.length ? ties.map(([k, v]) => `${k}: ${v.map(p => "#" + p.i).join(",")}`).join(" · ") : "none"}`);
    console.log(`  labels        ${r.data.points.length} placed, ${r.overlaps.pairs} overlapping pairs`);
    console.log(`  leaders       mean ${r.leaders.mean.toFixed(1)}px, max ${r.leaders.max.toFixed(1)}px, ${r.crosses.leaderLeader} crossing, ${r.crosses.leaderPill} through a label`);
    const fits = r.embedChars <= 50000;
    console.log(`  webflow       ${r.embedOut}  ${r.embedChars.toLocaleString()} chars ` +
      `${fits ? "— fits the ~50,000 Embed limit" : "— OVER the ~50,000 Embed limit, use the iframe instead"}`);
    for (const w of r.warnings) console.log(`  WARN  ${w}`);
    for (const w of soft) console.log(`  WARN  ${w}`);
    for (const p of problems) { console.log(`  FAIL  ${p}`); failed++; }
  } catch (e) {
    console.error(`\n${basename(f)}\n  FAIL  ${e.message}`);
    failed++;
  }
}

// gallery for local review
if (built.length) {
  const cards = built.map(r =>
    `<figure><figcaption>${r.name}</figcaption>` +
    `<iframe src="./${r.name}.html" loading="lazy" title="${r.data.title}"></iframe></figure>`).join("\n");
  writeFileSync("dist/index.html", `<!doctype html><meta charset="utf-8"><title>Eval charts</title>
<style>body{margin:0;padding:28px;background:#f6f7f7;font:400 14px/1.5 system-ui,sans-serif}
h1{font-size:19px;margin:0 0 20px}figure{margin:0 0 30px}figcaption{font-family:ui-monospace,monospace;
color:#555;margin-bottom:7px}iframe{width:100%;aspect-ratio:1413/752;border:1px solid #e2e2e2;
border-radius:12px;background:#fff;display:block}</style>
<h1>Eval charts &middot; ${built.length} built</h1>
${cards}`);
}

console.log(failed ? `\n${failed} problem(s)` : `\nok`);
process.exit(failed ? 1 : 0);
