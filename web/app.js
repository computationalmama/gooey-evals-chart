// Browser chart maker. Runs the *same* modules as `node build.mjs` — csv.js parses,
// render.js lays out with real text metrics, checks.js applies the same assertions —
// so a chart made here and a chart built on the command line are the same chart.
//
// __M is the module registry the bundler in build-app.mjs fills in.
(function () {
"use strict";

const { parseChartCsv, formatDate } = __M["csv.js"];
const { renderChart }               = __M["render.js"];
const { page, webflowEmbed }        = __M["template.js"];
const { allText, namespaceIds, check, slugify } = __M["checks.js"];
const { CANVAS }                    = __M["tokens.js"];

// Baked by build-app.mjs: every logo/icon as a data URI, every country motif.
const BAKED    = window.__BAKED__;
const EXAMPLES = window.__EXAMPLES__ || [];

const $ = id => document.getElementById(id);
const el = {
  csv: $("csv"), file: $("file"), pick: $("pick"), drop: $("drop"),
  examples: $("examples"), parsehint: $("parsehint"),
  chart: $("chart"), stage: $("stage"), tip: $("tip"),
  reportpanel: $("reportpanel"), report: $("report"), notes: $("notes"), verdict: $("verdict"),
  dlpanel: $("dlpanel"), slug: $("slug"), scale: $("scale"), pngdim: $("pngdim"),
  embedchars: $("embedchars"), iframecode: $("iframecode"),
};
const META_FIELDS = ["title", "date", "country", "byline", "url", "xnote", "ynote"];

const state = {
  table: "",          // the data rows, verbatim, comma-separated
  meta: {},           // the "# key: value" block, as an object
  slugDirty: false,   // has the user renamed the output?
  last: null,         // last successful render
  fontsEmbedded: true,
  token: 0,
  syncing: false,
};

// ── input normalising ────────────────────────────────────────────────────────
// A paste from Sheets or Excel is tab-separated. Convert to CSV here rather than in
// csv.js, so what the app hands the parser is exactly what the CLI would read.
function csvCell(v) {
  return /[",\n]|^\s|\s$/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
/**
 * Is a tab in this line a column separator, or just alignment padding?
 * A hand-aligned CSV writes "Workflow,\tAccuracy,\tLatency" — every tab there sits
 * against a comma. Getting this wrong silently renames every workflow, so the test is
 * "does any tab stand on its own", not "are there tabs".
 */
function tabIsDelimiter(line) {
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== "\t") continue;
    const before = line.slice(0, i).replace(/\t+$/, "").slice(-1);
    const after = line.slice(i + 1).replace(/^\t+/, "").slice(0, 1);
    if (before !== "," && after !== "," && (before || after)) return true;
  }
  return false;
}

function normalizePaste(text) {
  const lines = String(text).replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  const data = lines.filter(l => l.trim() && !l.trim().startsWith("#"));
  if (!data.some(tabIsDelimiter)) return lines.join("\n");   // csv.js trims the padding
  return lines
    .map(l => (l.trim().startsWith("#") || !l.includes("\t")) ? l
              : l.split("\t").map(c => csvCell(c.trim())).join(","))
    .join("\n");
}

/** Pull the "# key: value" block out, keeping the table rows verbatim. */
function splitMeta(text) {
  const meta = {}, rows = [];
  for (const raw of String(text).split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (line.startsWith("#")) {
      const m = /^#\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
      if (m) meta[m[1].toLowerCase()] = m[2].trim();
      continue;
    }
    rows.push(raw);
  }
  return { meta, table: rows.join("\n").replace(/^\n+|\n+$/g, "") };
}

/** meta + table -> the canonical CSV: what you'd commit to charts/. */
function composeCsv() {
  const out = [];
  for (const k of META_FIELDS) {
    const v = (state.meta[k] || "").trim();
    if (v) out.push(`# ${k}: ${v}`);
  }
  for (const a of ["x", "y"]) {
    const v = (state.meta[a] || "").trim();
    if (v) out.push(`# ${a}: ${v}`);
  }
  if (out.length) out.push("");
  out.push(state.table);
  return out.join("\n") + "\n";
}

// ── form <-> meta ────────────────────────────────────────────────────────────
function axisSpec(p) {
  if ($(p + "-auto").checked) return "";
  const g = k => $(`${p}-${k}`).value.trim();
  const bits = [g("name") || (p === "x" ? "Accuracy" : "Latency"), g("min"), g("max"), g("step")];
  while (bits.length > 1 && bits[bits.length - 1] === "") bits.pop();
  return bits.join(", ");
}
function readForm() {
  for (const k of META_FIELDS) {
    const v = $("m-" + k).value.trim();
    // <input type=date> can only hold YYYY-MM-DD. A CSV with anything else reads back
    // as empty, which would quietly erase the date on the next keystroke elsewhere.
    if (k === "date" && !v && state.meta.date &&
        !/^\d{4}-\d{2}-\d{2}$/.test(state.meta.date)) continue;
    state.meta[k] = v;
  }
  state.meta.x = axisSpec("x");
  state.meta.y = axisSpec("y");
}
function writeForm() {
  state.syncing = true;
  for (const k of META_FIELDS) $("m-" + k).value = state.meta[k] || "";
  const cc = (state.meta.country || "").toUpperCase();
  const sel = $("m-country");
  if (cc && ![...sel.options].some(o => o.value === cc)) {
    sel.add(new Option(cc + " · other (default pattern)", cc));
  }
  sel.value = cc;
  for (const a of ["x", "y"]) {
    const spec = (state.meta[a] || "").trim();
    const parts = spec ? spec.split(",").map(s => s.trim()) : [];
    $(a + "-auto").checked = parts.length < 3;
    if (parts.length) {
      $(a + "-name").value = parts[0] || "";
      $(a + "-min").value = parts[1] || "";
      $(a + "-max").value = parts[2] || "";
      $(a + "-step").value = parts[3] || "";
    }
  }
  state.syncing = false;
  paintAxisRows();
}
/** Auto axes still show their numbers, greyed, so you can see what auto chose. */
function paintAxisRows(axes) {
  for (const a of ["x", "y"]) {
    const auto = $(a + "-auto").checked;
    document.querySelector(`.axis-row[data-axis="${a}"]`).classList.toggle("auto", auto);
    for (const k of ["name", "min", "max", "step"]) $(`${a}-${k}`).readOnly = auto;
    if (auto && axes) {
      state.syncing = true;
      $(a + "-name").value = axes[a].name;
      $(a + "-min").value = String(axes[a].min);
      $(a + "-max").value = String(axes[a].max);
      $(a + "-step").value = String(axes[a].step);
      state.syncing = false;
    }
  }
}

// ── fonts: the same Google Fonts subsets fonts.js caches on disk ─────────────
const FONT_SPECS = [
  { family: "Domine", weight: 700 },
  { family: "Inter", weight: 400 },
  { family: "Inter", weight: 600 },
  { family: "Inter", weight: 700 },
];
const memFonts = new Map();

function b64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}
function hash(str) {                       // FNV-1a, just to keep cache keys short
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h.toString(16);
}
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* full or private */ } };

async function face(family, weight, chars) {
  const text = [...new Set([...chars])].sort().join("");   // same order as src/fonts.js
  const ck = `gcf:${hash(`${family}|${weight}|${text}`)}:${text.length}`;
  if (memFonts.has(ck)) return memFonts.get(ck);
  let base = lsGet(ck);
  if (!base) {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}` +
                `:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url)).text();
    const m = /url\((https:[^)]+)\)/.exec(css);
    if (!m) throw new Error(`no font URL for ${family} ${weight}`);
    base = b64(await (await fetch(m[1])).arrayBuffer());
    lsSet(ck, base);
  }
  const out = `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};` +
              `font-display:block;src:url(data:font/woff2;base64,${base}) format('woff2')}`;
  memFonts.set(ck, out);
  return out;
}

async function loadFonts(data) {
  const chars = allText(data, data.date);
  const per = { "Domine|700": data.title, "Inter|400": chars, "Inter|600": chars, "Inter|700": chars };
  const faces = [];
  for (const { family, weight } of FONT_SPECS) {
    const c = per[`${family}|${weight}`];
    if (c) faces.push(await face(family, weight, c));
  }
  return faces.join("\n");
}

// Fallback when Google Fonts can't be reached: link the families so the chart still
// measures and displays correctly. Only the *embedded* outputs need the data URIs.
let linkedFallback = false;
function linkFonts() {
  if (linkedFallback) return;
  linkedFallback = true;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Domine:wght@700" +
           "&family=Inter:wght@400;600;700&display=block";
  document.head.appendChild(l);
}

async function fontsReady(css) {
  $("gc-fonts").textContent = css;
  await document.fonts.load("700 45px Domine");   // exactly what the build harness loads
  await document.fonts.load("400 17px Inter");
  await document.fonts.load("600 15px Inter");
  await document.fonts.ready;
}

// ── render ───────────────────────────────────────────────────────────────────
function stage(msg, cls) {
  el.stage.textContent = msg;
  el.stage.className = cls || "";
}

async function render() {
  const my = ++state.token;
  if (!state.table.trim()) {
    el.chart.classList.remove("stale");
    el.chart.innerHTML = "";
    el.reportpanel.hidden = el.dlpanel.hidden = true;
    el.parsehint.textContent = "Waiting for data…";
    stage("idle");
    return;
  }

  let data;
  try {
    data = parseChartCsv(composeCsv(), "pasted data");
  } catch (e) {
    el.parsehint.textContent = String(e.message).replace(/^pasted data: /, "⚠ ");
    el.reportpanel.hidden = el.dlpanel.hidden = true;
    // Keep the last chart on screen — blanking it on every half-typed row would
    // flicker — but grey it out so it never reads as current.
    el.chart.classList.add("stale");
    stage("can’t parse", "err");
    return;
  }
  el.parsehint.textContent =
    `${data.points.length} workflow${data.points.length === 1 ? "" : "s"} · ` +
    `${data.axes.x.name} ${data.axes.x.min}–${data.axes.x.max} · ` +
    `${data.axes.y.name} ${data.axes.y.min}–${data.axes.y.max}`;

  data.date = formatDate(data.date);                 // as build.mjs does, before allText

  stage("loading fonts…", "busy");
  let fontCss = "";
  try {
    fontCss = await loadFonts(data);
    state.fontsEmbedded = true;
  } catch (e) {
    state.fontsEmbedded = false;
    linkFonts();
  }
  if (my !== state.token) return;

  stage("placing labels…", "busy");
  await fontsReady(fontCss);
  if (my !== state.token) return;

  const assets = {
    logos: BAKED.logos,
    icons: BAKED.icons,
    motif: BAKED.motifs[(data.country || "").toUpperCase()] || BAKED.motifs.default,
  };
  let res;
  try {
    res = renderChart(data, assets);
  } catch (e) {
    stage("render failed", "err");
    el.parsehint.textContent = "⚠ " + e.message;
    return;
  }
  if (my !== state.token) return;

  const svg = res.svg.trim();
  el.chart.classList.remove("stale");
  el.chart.innerHTML = svg;
  wireTooltip();

  const slug = slugify(data.title, state.meta.date);
  if (!state.slugDirty) el.slug.value = slug;

  state.last = { data, res, svg, fontCss, slug };
  downloads(state.last);            // sets embedChars, which the report prints
  report(state.last);
  stage(state.fontsEmbedded ? "ready" : "ready · fonts not embedded",
        state.fontsEmbedded ? "" : "err");
  paintAxisRows(data.axes);
}

// ── report: the same lines `node build.mjs` prints ───────────────────────────
function report(r) {
  const { data, res } = r;
  const { problems, ties, soft } = check({
    data, overlaps: res.overlaps, leaders: res.leaders, crosses: res.crosses,
  });

  const pills = idx => idx.length
    ? idx.map(i => `<span class="hi">#${i} ${esc(data.points[i].name)}</span>`).join("")
    : `<span class="num">none — every point is tied</span>`;
  const f = data.fastest.map(i => data.points[i].y);
  const a = data.accurate.map(i => data.points[i].x);

  el.report.innerHTML = [
    row("Fastest", pills(data.fastest) + num(f.length ? ` ${data.axes.y.name} ${f.join(", ")}` : "")),
    row("Most accurate", pills(data.accurate) + num(a.length ? ` ${data.axes.x.name} ${a.join(", ")}` : "")),
    row("X-axis ties", ties.length
      ? ties.map(([k, v]) => `<b>${esc(k)}</b> ${num(v.map(p => "#" + p.i).join(", "))}`).join(" · ")
      : num("none")),
    row("Labels", `${data.points.length} placed, <b>${res.overlaps.pairs} overlapping pair` +
      `${res.overlaps.pairs === 1 ? "" : "s"}</b>`),
    row("Leaders", num(`mean ${res.leaders.mean.toFixed(1)}px · max ${res.leaders.max.toFixed(1)}px · ` +
      `${res.crosses.leaderLeader} crossing · ${res.crosses.leaderPill} through a label`)),
    row("Webflow embed", num(`${r.embedChars ? r.embedChars.toLocaleString() : "—"} chars`)),
  ].join("");

  const notes = [];
  for (const w of res.warnings) notes.push(note("warn", w));
  for (const w of soft) notes.push(note("warn", w));
  for (const p of problems) notes.push(note("fail", p.replace(/\n\s+/g, "\n")));
  if (!state.fontsEmbedded) {
    notes.push(note("warn", "Google Fonts could not be reached, so the fonts are linked " +
      "rather than embedded. The chart on screen is right, but PNG and standalone HTML " +
      "need the embedded subsets — reconnect and re-render before downloading those."));
  }
  el.notes.innerHTML = notes.join("");

  el.verdict.textContent = problems.length ? `${problems.length} problem${problems.length === 1 ? "" : "s"}` : "ok";
  el.verdict.classList.toggle("bad", problems.length > 0);
  el.reportpanel.hidden = false;
}
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
const num = t => t ? `<span class="num">${esc(t)}</span>` : "";
const note = (kind, t) =>
  `<li class="${kind}"><b>${kind === "fail" ? "fail" : "warn"}</b>${esc(t)}</li>`;

// ── downloads ────────────────────────────────────────────────────────────────
function outputs(r) {
  const html = page({
    title: r.data.title,
    description: `${r.data.title}. ${r.data.byline}${r.data.date ? " · " + r.data.date : ""}`,
    fontCss: r.fontCss, svg: r.svg,
  });
  const name = el.slug.value.trim() || r.slug;
  const embed = webflowEmbed({
    svg: namespaceIds(r.svg, name.replace(/[^a-z0-9]+/gi, "")),
    slug: name.replace(/[^a-z0-9]+/gi, "-"),
    title: r.data.title,
  });
  return { name, html, embed };
}

function downloads(r) {
  const o = outputs(r);
  r.embedChars = o.embed.length;
  const fits = o.embed.length <= 50000;
  el.embedchars.textContent = `${o.embed.length.toLocaleString()} chars — ` +
    (fits ? "fits the ~50,000 limit" : "OVER the limit, use the iframe");
  el.iframecode.textContent =
    `<iframe src="/charts/${o.name}.html"\n` +
    `        style="width:100%;aspect-ratio:${CANVAS.w}/${CANVAS.h};border:0"\n` +
    `        loading="lazy" title="${r.data.title.replace(/"/g, "&quot;")}"></iframe>`;
  setScaleLabel();
  el.dlpanel.hidden = false;
}
function setScaleLabel() {
  const s = Number(el.scale.value);
  el.pngdim.textContent = `${CANVAS.w * s} × ${CANVAS.h * s}`;
}

function save(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const saveText = (text, filename, mime) =>
  save(new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" }), filename);

/**
 * Rasterise by handing the SVG to an <img> at the exact target pixel size, so the
 * vector is rendered at full resolution instead of a bitmap being scaled up.
 * The font subsets have to be inside the SVG: an SVG loaded as an image may not
 * fetch anything external.
 */
async function png(r, scale) {
  const w = CANVAS.w * scale, h = CANVAS.h * scale;
  const sized = r.svg
    .replace(/^<svg([^>]*?)\swidth="100%"/, `<svg$1 width="${w}" height="${h}"`)
    .replace(/^(<svg[^>]*>)/, `$1<style>${r.fontCss}</style>`);
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(sized);
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error("the browser refused to rasterise the SVG"));
  });
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((res, rej) =>
    c.toBlob(b => b ? res(b) : rej(new Error("canvas produced no PNG")), "image/png"));
}

// ── tooltip on the live preview (same behaviour as the built page) ───────────
function wireTooltip() {
  const root = el.chart, tip = el.tip;
  const groups = [...root.querySelectorAll(".gc-pill,.gc-dot")];
  let cur = null;
  for (const g of groups) {
    const t = g.querySelector("title");
    if (t) { g.setAttribute("data-tip", t.textContent); t.remove(); }
  }
  const show = (g, e) => {
    const i = g.getAttribute("data-i");
    const p = (g.getAttribute("data-tip") || "").split(" — ");
    tip.innerHTML = `<b>${esc(p[0])}</b>${p[1] ? " · " + esc(p[1]) : ""}`;
    tip.classList.add("show");
    tip.style.left = e.clientX + "px";
    tip.style.top = e.clientY + "px";
    if (cur !== i) {
      root.classList.add("gc-hot");
      for (const x of groups) x.classList.toggle("gc-on", x.getAttribute("data-i") === i);
      cur = i;
    }
  };
  const hide = () => {
    tip.classList.remove("show");
    root.classList.remove("gc-hot");
    for (const x of groups) x.classList.remove("gc-on");
    cur = null;
  };
  for (const g of groups) {
    g.addEventListener("mouseenter", e => show(g, e));
    g.addEventListener("mousemove", e => show(g, e));
    g.addEventListener("mouseleave", hide);
  }
  root.addEventListener("mouseleave", hide);
}

// ── loading data ─────────────────────────────────────────────────────────────
function ingest(text, filename) {
  const { meta, table } = splitMeta(normalizePaste(text));
  el.csv.value = table;        // the box holds the rows; the "#" block edits as a form
  state.table = table;
  state.meta = meta;
  // A named file keeps its name; a bare paste goes back to tracking the title.
  state.slugDirty = Boolean(filename);
  if (filename) el.slug.value = filename.replace(/\.(csv|tsv|txt)$/i, "");
  writeForm();
  render();
}

let timer;
const debounced = () => { clearTimeout(timer); timer = setTimeout(render, 200); };

el.csv.addEventListener("input", () => {
  const { meta, table } = splitMeta(el.csv.value);
  state.table = table;
  // A "# key:" line typed straight into the box wins over the form fields.
  if (Object.keys(meta).length) { state.meta = { ...state.meta, ...meta }; writeForm(); }
  debounced();
});
el.csv.addEventListener("paste", e => {
  const t = (e.clipboardData || window.clipboardData)?.getData("text") || "";
  const whole = el.csv.value === "" ||
    (el.csv.selectionStart === 0 && el.csv.selectionEnd === el.csv.value.length);
  if (!t || !whole) return;                 // a partial edit: let it paste normally
  e.preventDefault();
  ingest(t);
});

for (const id of META_FIELDS.map(k => "m-" + k)) {
  $(id).addEventListener("input", () => { if (!state.syncing) { readForm(); debounced(); } });
}
for (const a of ["x", "y"]) {
  $(a + "-auto").addEventListener("change", () => { readForm(); render(); });
  for (const k of ["name", "min", "max", "step"]) {
    $(`${a}-${k}`).addEventListener("input", () => {
      if (!state.syncing) { readForm(); debounced(); }
    });
  }
}
el.slug.addEventListener("input", () => {
  state.slugDirty = true;
  if (state.last) downloads(state.last);
});
el.scale.addEventListener("change", setScaleLabel);

el.pick.addEventListener("click", () => el.file.click());
el.file.addEventListener("change", async () => {
  const f = el.file.files[0];
  if (f) ingest(await f.text(), f.name);
  el.file.value = "";
});
for (const ev of ["dragenter", "dragover"]) {
  el.drop.addEventListener(ev, e => { e.preventDefault(); el.drop.classList.add("over"); });
}
for (const ev of ["dragleave", "drop"]) {
  el.drop.addEventListener(ev, e => { e.preventDefault(); el.drop.classList.remove("over"); });
}
el.drop.addEventListener("drop", async e => {
  const f = e.dataTransfer?.files?.[0];
  if (f) ingest(await f.text(), f.name);
});

for (const ex of EXAMPLES) el.examples.add(new Option(ex.name, ex.name));
el.examples.addEventListener("change", () => {
  const ex = EXAMPLES.find(x => x.name === el.examples.value);
  if (!ex) return;
  el.csv.value = ex.csv;
  state.slugDirty = false;
  ingest(ex.csv, ex.name.startsWith("_") ? null : ex.name + ".csv");
  el.examples.value = "";
});

$("dl-png").addEventListener("click", async e => {
  if (!state.last) return;
  const b = e.currentTarget, was = b.querySelector("span").textContent;
  b.disabled = true;
  b.querySelector("span").textContent = "rendering…";
  try {
    const s = Number(el.scale.value);
    const blob = await png(state.last, s);
    save(blob, `${el.slug.value.trim() || state.last.slug}@${s}x.png`);
  } catch (err) {
    b.querySelector("span").textContent = "failed: " + err.message;
    setTimeout(() => { b.querySelector("span").textContent = was; }, 4000);
    b.disabled = false;
    return;
  }
  b.querySelector("span").textContent = was;
  b.disabled = false;
});
$("dl-html").addEventListener("click", () => {
  if (!state.last) return;
  const o = outputs(state.last);
  saveText(o.html, `${o.name}.html`, "text/html");
});
$("dl-embed").addEventListener("click", () => {
  if (!state.last) return;
  const o = outputs(state.last);
  saveText(o.embed, `${o.name}.embed.html`, "text/html");
});
$("dl-csv").addEventListener("click", () => {
  if (!state.last) return;
  saveText(composeCsv(), `${el.slug.value.trim() || state.last.slug}.csv`, "text/csv");
});
$("copyiframe").addEventListener("click", async e => {
  try {
    await navigator.clipboard.writeText(el.iframecode.textContent);
    e.currentTarget.textContent = "Copied";
    setTimeout(() => { e.currentTarget.textContent = "Copy"; }, 1600);
  } catch (err) { e.currentTarget.textContent = "Select and copy manually"; }
});

// A <style> the font subsets are written into on every render.
const fs = document.createElement("style");
fs.id = "gc-fonts";
document.head.appendChild(fs);

// Exposed so verify-app.mjs can drive the exact same pipeline in headless Chrome.
window.GC = { state, ingest, render, outputs, png, composeCsv, loadFonts };

setScaleLabel();
if (location.hash.length > 1) {
  try { ingest(decodeURIComponent(location.hash.slice(1))); } catch (e) { /* ignore */ }
}
})();
