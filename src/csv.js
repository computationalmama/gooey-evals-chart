// Parse a chart CSV: a leading "# key: value" metadata block, then a normal table.
// Keeping both in one file means a chart is a single artefact that Sheets still opens.

function splitRow(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function num(v, what) {
  const n = Number(String(v).replace(/[^0-9eE+.-]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`${what}: not a number: ${JSON.stringify(v)}`);
  return n;
}

// "# x: Accuracy, 0, 1, 0.1" -> axis spec; bounds/step optional
function parseAxis(raw, fallbackName) {
  if (!raw) return { name: fallbackName, min: null, max: null, step: null };
  const p = raw.split(",").map(s => s.trim());
  return {
    name: p[0] || fallbackName,
    min: p[1] !== undefined && p[1] !== "" ? num(p[1], "axis min") : null,
    max: p[2] !== undefined && p[2] !== "" ? num(p[2], "axis max") : null,
    step: p[3] !== undefined && p[3] !== "" ? num(p[3], "axis step") : null,
  };
}

// Pick a "nice" round step so an auto-scaled axis still lands on readable ticks.
function niceAxis(lo, hi) {
  if (hi === lo) hi = lo + 1;
  const span = hi - lo;
  const mag = Math.pow(10, Math.floor(Math.log10(span / 5)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= 8) ?? mag * 10;
  // Scaling by a fractional step leaves float dust (0.7 -> 0.7000000000000001), which
  // would end up in a "# x:" line if an auto axis is later pinned.
  const clean = v => Number(v.toPrecision(12));
  return { min: clean(Math.min(0, Math.floor(lo / step) * step)),
           max: clean(Math.ceil(hi / step) * step), step: clean(step) };
}

export function parseChartCsv(text, srcName = "chart.csv") {
  const lines = text.split(/\r?\n/);
  const meta = {};
  const rows = [];
  let header = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const m = /^#\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
      if (m) meta[m[1].toLowerCase()] = m[2].trim();
      continue;                                   // plain comments are ignored
    }
    const cells = splitRow(line);
    if (!header) { header = cells.map(h => h.toLowerCase()); continue; }
    if (cells.every(c => c === "")) continue;
    rows.push(cells);
  }

  if (!header) throw new Error(`${srcName}: no header row found`);

  // Tiered so a teammate's column name doesn't have to be exact:
  // "Accuracy", "Accuracy (mean)", "Mean Accuracy" and "accuracy_mean" all resolve.
  const find = (...names) => {
    const tests = [
      h => names.some(n => h === n),
      h => names.some(n => h.startsWith(n)),
      h => names.some(n => h.includes(n)),
    ];
    for (const t of tests) {
      const i = header.findIndex(t);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iName = find("workflow", "model", "name");
  const iX = find("accuracy", "score");
  const iY = find("latency", "time");
  for (const [i, what] of [[iName, "Workflow"], [iX, "Accuracy"], [iY, "Latency"]]) {
    if (i < 0) throw new Error(`${srcName}: missing a "${what}" column (found: ${header.join(", ")})`);
  }

  const points = rows.map((r, idx) => ({
    i: idx,                                       // row order drives the printed number
    name: r[iName],
    x: num(r[iX], `${srcName} row ${idx} accuracy`),
    y: num(r[iY], `${srcName} row ${idx} latency`),
  }));
  if (!points.length) throw new Error(`${srcName}: no data rows`);

  // Pasting a pandas frame leaves its index inside the name ("0 Gemini 3.1 Pro").
  // Only strip when the leading numbers are exactly 0..n-1 in order, so a model whose
  // name genuinely begins with a digit is left alone.
  const lead = points.map(p => /^(\d+)\s+(.*)$/.exec(p.name));
  if (lead.every(Boolean) && lead.every((m, i) => Number(m[1]) === i)) {
    points.forEach((p, i) => { p.name = lead[i][2].trim(); });
  }

  const xs = parseAxis(meta.x, "Accuracy");
  const ys = parseAxis(meta.y, "Latency");
  if (xs.min === null || xs.max === null) {
    const n = niceAxis(Math.min(...points.map(p => p.x)), Math.max(...points.map(p => p.x)));
    xs.min ??= n.min; xs.max ??= n.max; xs.step ??= n.step;
  }
  if (ys.min === null || ys.max === null) {
    const n = niceAxis(Math.min(...points.map(p => p.y)), Math.max(...points.map(p => p.y)));
    ys.min ??= n.min; ys.max ??= n.max; ys.step ??= n.step;
  }
  xs.step ??= (xs.max - xs.min) / 10;
  ys.step ??= (ys.max - ys.min) / 7;

  // Highlights: recomputed from the data, all ties included.
  const minY = Math.min(...points.map(p => p.y));
  const maxX = Math.max(...points.map(p => p.x));
  const tied = g => (g.length === points.length && points.length > 1 ? [] : g);
  const fastest = tied(points.filter(p => p.y === minY).map(p => p.i));
  const accurate = tied(points.filter(p => p.x === maxX).map(p => p.i));

  return {
    title: meta.title || "Untitled evaluation",
    country: (meta.country || "").toUpperCase(),
    byline: meta.byline || "",
    date: meta.date || "",
    url: meta.url || "",
    xNote: meta.xnote || "More accurate",
    yNote: meta.ynote || "Lower is better",
    axes: { x: xs, y: ys },
    points, fastest, accurate,
  };
}

// "2026-08-13" -> "13 Aug 2026" (matches the reference byline)
export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return iso || "";
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${Number(m[3])} ${mon[Number(m[2]) - 1]} ${m[1]}`;
}
