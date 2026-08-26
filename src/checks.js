// The build's own assertions, shared by build.mjs and the browser chart maker so both
// pass or fail a chart identically. Pure JS — no node: imports (see CLAUDE.md).
//
// These encode the failure modes the AI-generated infographic had: ties that didn't
// line up, points drawn outside the plot, and labels sitting on top of each other.

const PUNCT = "0123456789.,:;•·—-+()/%©↓→ ";

/** Every character a chart's fonts must cover, for per-chart woff2 subsetting. */
export function allText(d, formattedDate) {
  const bits = [d.title, d.byline, d.url, formattedDate ?? d.date, d.xNote, d.yNote,
    d.axes.x.name, d.axes.y.name, "Fastest", "Most Accurate", "Gooey.AI", "By"];
  for (const p of d.points) bits.push(p.name, String(p.x), String(p.y), String(p.i));
  return bits.join("") + PUNCT;
}

/** Prefix every id in an SVG so two charts can share one host page. */
export function namespaceIds(svg, prefix) {
  const ids = [...new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]))];
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    svg = svg
      .replace(new RegExp(`(\\sid=")${esc}(")`, "g"), `$1${prefix}-${id}$2`)
      .replace(new RegExp(`url\\(#${esc}\\)`, "g"), `url(#${prefix}-${id})`)
      .replace(new RegExp(`(href=")#${esc}(")`, "g"), `$1#${prefix}-${id}$2`);
  }
  return svg;
}

/** "Yoruba Evaluation of Audio AI Models" + "2026-08-13" -> "yoruba-evaluation-of-audio-ai-models-2026-08-13" */
export function slugify(title, date) {
  const base = String(title || "chart").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "chart";
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? `-${date}` : "";
  return base + iso;
}

/**
 * r: { data, overlaps, leaders, crosses } — exactly what renderChart returns plus the
 * parsed data. Returns { problems, ties, soft }: problems are fatal, soft are warnings.
 */
export function check(r) {
  const problems = [];
  const { data, overlaps } = r;

  // 1. equal accuracy MUST land on the same x pixel
  const byX = new Map();
  for (const p of data.points) {
    const k = String(p.x);
    if (!byX.has(k)) byX.set(k, []);
    byX.get(k).push(p);
  }
  const ties = [...byX.entries()].filter(([, v]) => v.length > 1);

  // 2. every point must fall inside the declared axis range, or it silently draws
  //    outside the plot area (and can end up over the title)
  const nice = (v, step) => Math.ceil(v / step) * step;
  for (const [axis, get] of [["x", p => p.x], ["y", p => p.y]]) {
    const a = data.axes[axis];
    const bad = data.points.filter(p => get(p) < a.min || get(p) > a.max);
    if (!bad.length) continue;
    const worst = Math.max(...bad.map(get));
    const list = bad.map(p => `#${p.i} ${p.name} (${get(p)})`).join(", ");
    problems.push(
      `${bad.length} point(s) outside the ${a.name} axis range ${a.min}-${a.max}: ${list}\n` +
      `        fix: set "# ${axis}: ${a.name}, ${a.min}, ${nice(worst, a.step)}, ${a.step}" ` +
      `or delete the "# ${axis}:" line to auto-scale`);
  }

  // 3. no label may overlap another
  if (overlaps.pairs > 0) {
    problems.push(`${overlaps.pairs} overlapping label pair(s), worst ${Math.round(overlaps.worst)}px²`);
  }
  // 4. crossings are not fatal, but must never be silent
  const soft = [];
  if (r.crosses.leaderPill > 0) {
    soft.push(`${r.crosses.leaderPill} leader(s) pass through another label — the plot is `
      + `getting crowded (${data.points.length} workflows)`);
  }
  if (r.crosses.leaderLeader > 0) soft.push(`${r.crosses.leaderLeader} leader(s) cross each other`);
  if (r.leaders.max > 200) soft.push(`longest leader is ${Math.round(r.leaders.max)}px`);
  return { problems, ties, soft };
}
