// Builds the chart SVG. Runs in the browser so text metrics are real; the output is
// a static SVG string that needs no JS to display.

import { CANVAS, CARD, PLOT, C, TYPE, ANCHOR, PILL, POINT, LEADER } from "./tokens.js";
import { chipsFor } from "./providers.js";
import { buildScales, solveLabels, leaderAnchor, overlapReport, leaderStats, crossReport } from "./layout.js";

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n = v => Math.round(v * 100) / 100;

let _ctx;
function measure(text, t) {
  _ctx ??= document.createElement("canvas").getContext("2d");
  _ctx.font = `${t.weight} ${t.size}px "${t.family}", sans-serif`;
  return _ctx.measureText(text).width;
}

const font = t => `font-family="${t.family}" font-size="${t.size}" font-weight="${t.weight}"`;

// Arrow glyphs are drawn, not typed: Inter's latin subset has no U+2192 (->),
// so a text arrow would silently fall back to a system font.
function arrow(x, y, dir, len, col, sw = 1.5) {
  const h = 4.2;
  if (dir === "down") {
    return `<path d="M${n(x)} ${n(y - len)} V${n(y)} M${n(x - h)} ${n(y - h)} L${n(x)} ${n(y)} L${n(x + h)} ${n(y - h)}" stroke="${col}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`;
  }
  return `<path d="M${n(x)} ${n(y)} H${n(x + len)} M${n(x + len - h)} ${n(y - h)} L${n(x + len)} ${n(y)} L${n(x + len - h)} ${n(y + h)}" stroke="${col}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`;
}

function chipDims(asset, h) {
  return { w: Math.round((asset.w / asset.h) * h), h };
}

// Assets are emitted once into <defs> as symbols; every use site is a cheap <use>.
function makeImg() {
  const ids = new Map();
  const img = (asset, x, y, w, h) => {
    if (!ids.has(asset)) ids.set(asset, `g${ids.size}`);
    return `<use href="#${ids.get(asset)}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"/>`;
  };
  img.symbols = () => [...ids.entries()].map(([a, id]) =>
    `<symbol id="${id}" viewBox="0 0 ${a.w} ${a.h}" preserveAspectRatio="xMidYMid meet">` +
    `<image href="${a.href}" width="${a.w}" height="${a.h}"/></symbol>`).join("");
  return img;
}

function ticks(min, max, step) {
  const out = [];
  const eps = step * 1e-6;
  for (let v = min; v <= max + eps; v += step) out.push(Math.abs(v) < eps ? 0 : v);
  return out;
}

const fmtTick = (v, step) => {
  const d = Math.max(0, -Math.floor(Math.log10(step)) + (Number.isInteger(step) ? 0 : 0));
  return step < 1 ? v.toFixed(Math.max(1, d)) : String(Math.round(v));
};

/** data: from parseChartCsv. assets: { logos, icons, motif } already as data URIs.
 *  adjustments: optional { i: { dx, dy } } map of manual position offsets. */
export function renderChart(data, assets, adjustments = {}) {
  const img = makeImg();
  const { sx, sy } = buildScales(data.axes, PLOT);
  const fastest = new Set(data.fastest);
  const accurate = new Set(data.accurate);
  const warnings = [];

  // ---- 1. measure every pill -------------------------------------------------
  const items = data.points.map(p => {
    const chips = chipsFor(p.name);
    if (chips.unknown.length) warnings.push(`no logo for "${chips.unknown.join('", "')}" in row ${p.i} (${p.name})`);
    const lead = chips.lead ? assets.logos[chips.lead] : null;
    const trail = chips.trail.map(id => assets.logos[id]).filter(Boolean);
    const isF = fastest.has(p.i), isA = accurate.has(p.i);
    const badges = [];
    if (isF) badges.push({ text: "Fastest", icon: assets.icons.rabbit });
    if (isA) badges.push({ text: "Most Accurate", icon: assets.icons.brain });

    const textW = measure(p.name, TYPE.label);
    let w = PILL.padX * 2 + textW;
    const leadD = lead ? chipDims(lead, PILL.chip) : null;
    if (leadD) w += leadD.w + PILL.gap;
    const trailD = trail.map(a => chipDims(a, PILL.chip));
    for (const d of trailD) w += PILL.gap + d.w;
    for (const b of badges) {
      b.iconD = chipDims(b.icon, 20);
      b.textW = measure(b.text, TYPE.badge);
      w += PILL.gap + b.iconD.w + 5 + b.textW;
    }
    return {
      i: p.i, name: p.name, vx: p.x, vy: p.y,
      cx: sx(p.x), cy: sy(p.y), w, h: PILL.h,
      lead, leadD, trail, trailD, badges, textW,
      hi: isF || isA,
    };
  });

  // ---- 2. solve label placement ---------------------------------------------
  const inset = 3;
  const rightLimit = CARD.x + CARD.w - 12;      // empty card margin past the plot edge
  const bounds = {
    x: PLOT.l + inset, y: PLOT.t + inset,
    w: rightLimit - (PLOT.l + inset), h: PLOT.b - PLOT.t - inset * 2,
  };
  // The "More accurate ->" note sits inside the plot, so labels must treat it as
  // occupied space or a wide pill will cover it.
  const xNoteW = measure(data.xNote, TYPE.note) + 30;
  const fixed = [
    { x: PLOT.r - 8 - xNoteW, y: PLOT.b - 28, w: xNoteW + 8, h: 24 },
  ];
  const { pills, score } = solveLabels(items, bounds, POINT.r, 0x9e3779b9, { fixed });
  const overlaps = overlapReport(pills);
  const leaders_ = leaderStats(pills, items);
  const crosses = crossReport(pills, items);

  // ---- 3. emit ---------------------------------------------------------------
  const s = [];
  s.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}" width="100%" role="img" aria-label="${esc(data.title)}">`);
  s.push(`<title>${esc(data.title)}</title>`);

  s.push(`<defs>
<pattern id="ht" width="9" height="9" patternUnits="userSpaceOnUse">
  <circle cx="4.5" cy="4.5" r="2" fill="${C.halftone}"/>
</pattern>
<pattern id="mo" width="60" height="60" patternUnits="userSpaceOnUse">
  <g color="${C.motif}">${assets.motif}</g>
</pattern>
__SYMBOLS__
<clipPath id="plotClip"><rect x="${PLOT.l}" y="${PLOT.t}" width="${PLOT.r - PLOT.l}" height="${PLOT.b - PLOT.t}"/></clipPath>
<filter id="cardShadow" x="-6%" y="-12%" width="112%" height="128%">
  <feDropShadow dx="0" dy="5" stdDeviation="9" flood-color="#0b0b0b" flood-opacity="0.10"/>
</filter>
</defs>`);

  // background: texture + motif over the whole canvas, then the opaque card on top,
  // which is what leaves the texture living only in the margins.
  s.push(`<rect width="${CANVAS.w}" height="${CANVAS.h}" fill="${C.bg}"/>`);
  s.push(`<rect width="${CANVAS.w}" height="${CANVAS.h}" fill="url(#ht)"/>`);
  s.push(`<rect x="0" y="150" width="${CARD.x - 4}" height="${CARD.h + 40}" fill="url(#mo)" opacity="1"/>`);
  s.push(`<rect x="${CARD.x + CARD.w + 4}" y="150" width="${CANVAS.w - CARD.x - CARD.w - 4}" height="${CARD.h + 40}" fill="url(#mo)" opacity="1"/>`);

  // title + byline
  const bl = data.byline.split(",");
  const head = (bl[0] || "").trim();
  const rest = bl.slice(1).join(",").trim();
  const parts = [];
  if (data.date) parts.push(data.date);
  if (data.url) parts.push(data.url);
  const tail = (rest ? `, ${rest}` : "") + (parts.length ? ` • ${parts.join(" • ")}` : "");
  s.push(`<text x="${CANVAS.w / 2}" y="${ANCHOR.titleBaseline}" text-anchor="middle" fill="${C.ink}" ${font(TYPE.title)}>${esc(data.title)}</text>`);
  s.push(`<text x="${CANVAS.w / 2}" y="${ANCHOR.subtitleBaseline}" text-anchor="middle" fill="${C.ink2}" ${font(TYPE.subtitle)}>` +
    `<tspan>By </tspan><tspan font-weight="700">${esc(head)}</tspan><tspan>${esc(tail)}</tspan></text>`);

  // card
  s.push(`<rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.r}" fill="${C.card}" stroke="${C.cardStroke}" filter="url(#cardShadow)"/>`);

  // grid
  const xt = ticks(data.axes.x.min, data.axes.x.max, data.axes.x.step);
  const yt = ticks(data.axes.y.min, data.axes.y.max, data.axes.y.step);
  const g = [];
  for (const v of xt) g.push(`<line x1="${n(sx(v))}" y1="${PLOT.t}" x2="${n(sx(v))}" y2="${PLOT.b}"/>`);
  for (const v of yt) g.push(`<line x1="${PLOT.l}" y1="${n(sy(v))}" x2="${PLOT.r}" y2="${n(sy(v))}"/>`);
  s.push(`<g stroke="${C.grid}" stroke-width="1">${g.join("")}</g>`);
  s.push(`<g stroke="${C.axis}" stroke-width="1.6"><line x1="${PLOT.l}" y1="${PLOT.t}" x2="${PLOT.l}" y2="${PLOT.b}"/><line x1="${PLOT.l}" y1="${PLOT.b}" x2="${PLOT.r}" y2="${PLOT.b}"/></g>`);

  // tick labels
  for (const v of yt) {
    s.push(`<text x="${PLOT.l - ANCHOR.tickGapX}" y="${n(sy(v) + 6)}" text-anchor="end" fill="${C.ink2}" ${font(TYPE.tick)}>${fmtTick(v, data.axes.y.step)}</text>`);
  }
  for (const v of xt) {
    s.push(`<text x="${n(sx(v))}" y="${PLOT.b + ANCHOR.tickBaselineGapY}" text-anchor="middle" fill="${C.ink2}" ${font(TYPE.tick)}>${fmtTick(v, data.axes.x.step)}</text>`);
  }

  // axis names, each led by its icon
  const xIcon = chipDims(assets.icons.brain, 24);
  const xNameW = measure(data.axes.x.name, TYPE.axisName);
  const xTotal = xIcon.w + 8 + xNameW;
  const xStart = (PLOT.l + PLOT.r) / 2 - xTotal / 2;
  s.push(img(assets.icons.brain, xStart, ANCHOR.xAxisNameBaseline - 19, xIcon.w, xIcon.h));
  s.push(`<text x="${n(xStart + xIcon.w + 8)}" y="${ANCHOR.xAxisNameBaseline}" fill="${C.ink}" ${font(TYPE.axisName)}>${esc(data.axes.x.name)}</text>`);

  const yIcon = chipDims(assets.icons.rabbit, 24);
  const yNameW = measure(data.axes.y.name, TYPE.axisName);
  s.push(`<g transform="translate(${ANCHOR.yAxisNameX} ${ANCHOR.yAxisNameCentre}) rotate(-90)">` +
    `<text x="${n(yNameW / 2 - yNameW)}" y="7" fill="${C.ink}" ${font(TYPE.axisName)}>${esc(data.axes.y.name)}</text>` +
    `</g>`);
  s.push(img(assets.icons.rabbit, ANCHOR.yAxisNameX - yIcon.w / 2, ANCHOR.yAxisNameCentre + yNameW / 2 + 12, yIcon.w, yIcon.h));

  // legend notes
  s.push(arrow(PLOT.l + 16, PLOT.t - 12, "down", 13, C.ink2));
  s.push(`<text x="${PLOT.l + 26}" y="${PLOT.t - 12}" fill="${C.ink2}" ${font(TYPE.note)}>${esc(data.yNote)}</text>`);
  const nw = measure(data.xNote, TYPE.note);
  s.push(`<text x="${PLOT.r - 8 - 26 - nw}" y="${PLOT.b - 12}" fill="${C.ink2}" ${font(TYPE.note)}>${esc(data.xNote)}</text>`);
  s.push(arrow(PLOT.r - 8 - 22, PLOT.b - 16, "right", 18, C.ink2));

  // leaders (under everything else in the plot)
  const leaders = [];
  items.forEach((it, k) => {
    const p = pills[k];
    const adj = adjustments[it.i] || { dx: 0, dy: 0 };
    const adjPill = { x: p.x + adj.dx, y: p.y + adj.dy, w: p.w, h: p.h };
    const pt = { x: it.cx, y: it.cy };
    const a = leaderAnchor(adjPill, pt);
    const d = Math.hypot(pt.x - a.x, pt.y - a.y);
    if (d <= POINT.r + 1) return;
    const t = (d - POINT.r) / d;
    leaders.push(`<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(a.x + (pt.x - a.x) * t)}" y2="${n(a.y + (pt.y - a.y) * t)}"/>`);
  });
  s.push(`<g clip-path="url(#plotClip)" stroke="${C.leader}" stroke-width="${LEADER.width}">${leaders.join("")}</g>`);

  // pills
  items.forEach((it, k) => {
    const p = pills[k];
    const adj = adjustments[it.i] || { dx: 0, dy: 0 };
    const px = p.x + adj.dx;
    const py = p.y + adj.dy;
    const fill = it.hi ? C.highlight : C.pill;
    const stroke = it.hi ? C.highlightStroke : C.pillStroke;
    const tip = `${it.name} — ${data.axes.x.name} ${it.vx}, ${data.axes.y.name} ${it.vy}`;
    const b = [];
    b.push(`<g class="gc-pill" data-i="${it.i}" data-ox="${n(p.x)}" data-oy="${n(p.y)}"><title>${esc(tip)}</title>`);
    b.push(`<rect x="${n(px)}" y="${n(py)}" width="${n(p.w)}" height="${n(p.h)}" rx="${PILL.r}" fill="${fill}" stroke="${stroke}" stroke-width="${PILL.stroke}"/>`);
    let cx = px + PILL.padX;
    const midY = py + p.h / 2;
    if (it.leadD) { b.push(img(it.lead, cx, midY - it.leadD.h / 2, it.leadD.w, it.leadD.h)); cx += it.leadD.w + PILL.gap; }
    b.push(`<text x="${n(cx)}" y="${n(midY + 6)}" fill="${C.ink}" ${font(TYPE.label)}>${esc(it.name)}</text>`);
    cx += it.textW;
    it.trailD.forEach((d, di) => { cx += PILL.gap; b.push(img(it.trail[di], cx, midY - d.h / 2, d.w, d.h)); cx += d.w; });
    for (const bd of it.badges) {
      cx += PILL.gap;
      b.push(img(bd.icon, cx, midY - bd.iconD.h / 2, bd.iconD.w, bd.iconD.h));
      cx += bd.iconD.w + 5;
      b.push(`<text x="${n(cx)}" y="${n(midY + 5)}" fill="${C.ink}" ${font(TYPE.badge)}>${esc(bd.text)}</text>`);
      cx += bd.textW;
    }
    b.push(`</g>`);
    s.push(b.join(""));
  });

  // points last, so a numbered circle is never hidden
  items.forEach(it => {
    const fill = it.hi ? C.highlight : C.point;
    const stroke = it.hi ? C.highlightStroke : C.pointStroke;
    s.push(`<g class="gc-dot" data-i="${it.i}"><title>${esc(`${it.name} — ${data.axes.x.name} ${it.vx}, ${data.axes.y.name} ${it.vy}`)}</title>` +
      `<circle cx="${n(it.cx)}" cy="${n(it.cy)}" r="${POINT.r}" fill="${fill}" stroke="${stroke}" stroke-width="${POINT.stroke}"/>` +
      `<text x="${n(it.cx)}" y="${n(it.cy + 4.2)}" text-anchor="middle" fill="${C.ink}" ${font(TYPE.pointNum)}>${it.i}</text></g>`);
  });

  // footer
  const fIcon = chipDims(assets.logos.gooey, 26);
  const cw = measure("© 2026", TYPE.footer);
  const gw = measure("Gooey.AI", TYPE.footer);
  const total = cw + 12 + fIcon.w + 7 + gw;
  let fx = CANVAS.w / 2 - total / 2;
  s.push(`<text x="${n(fx)}" y="${ANCHOR.footerBaseline}" fill="${C.ink2}" ${font(TYPE.footer)}>© ${esc((data.date.match(/\d{4}/) || ["2026"])[0])}</text>`);
  fx += cw + 12;
  s.push(img(assets.logos.gooey, fx, ANCHOR.footerBaseline - 20, fIcon.w, fIcon.h));
  fx += fIcon.w + 7;
  s.push(`<text x="${n(fx)}" y="${ANCHOR.footerBaseline}" fill="${C.ink}" font-family="Inter" font-size="${TYPE.footer.size}" font-weight="700">Gooey.AI</text>`);

  s.push(`</svg>`);
  const out = s.join("\n").replace("__SYMBOLS__", img.symbols());
  return { svg: out, warnings, overlaps, score, leaders: leaders_, crosses };
}
