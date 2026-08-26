// Label placement. Runs in the browser (it needs real text metrics), but is a pure
// function of its inputs and uses a seeded PRNG, so the same data always yields the
// same layout -> byte-identical builds and meaningful PNG diffs.

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildScales(axes, plot) {
  const { x, y } = axes;
  return {
    sx: v => plot.l + ((v - x.min) / (x.max - x.min)) * (plot.r - plot.l),
    sy: v => plot.b - ((v - y.min) / (y.max - y.min)) * (plot.b - plot.t),
  };
}

const rectOverlap = (a, b) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

const outsideArea = (r, b) => {
  const inW = Math.max(0, Math.min(r.x + r.w, b.x + b.w) - Math.max(r.x, b.x));
  const inH = Math.max(0, Math.min(r.y + r.h, b.y + b.h) - Math.max(r.y, b.y));
  return r.w * r.h - inW * inH;
};

function segSeg(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
}

function segRect(p1, p2, r) {
  const c = [
    { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h },
  ];
  for (let i = 0; i < 4; i++) if (segSeg(p1, p2, c[i], c[(i + 1) % 4])) return true;
  return false;
}

// Where the leader leaves the pill: the CLOSEST point on the pill's border to the
// data point. Projecting from the pill centre instead makes a wide pill placed
// diagonally sprout a long leader even when its edge is right next to the point.
export function leaderAnchor(pill, pt) {
  return {
    x: Math.min(Math.max(pt.x, pill.x), pill.x + pill.w),
    y: Math.min(Math.max(pt.y, pill.y), pill.y + pill.h),
  };
}

const DIRS = Array.from({ length: 24 }, (_, k) => {
  const a = (k * Math.PI * 2) / 24;
  return { ux: Math.cos(a), uy: Math.sin(a) };
});
const GAPS = [11, 16, 24, 34, 48, 66, 88];

function candidates(item, bounds) {
  const out = [];
  for (const { ux, uy } of DIRS) {
    for (const g of GAPS) {
      const R = g + Math.abs(ux) * item.w / 2 + Math.abs(uy) * item.h / 2;
      const x = item.cx + ux * R - item.w / 2;
      const y = item.cy + uy * R - item.h / 2;
      const r = { x, y, w: item.w, h: item.h };
      if (outsideArea(r, bounds) > 0.5) continue;   // never allow a clipped label
      // prefer above / to the right, as the reference does
      const bias = (uy > 0 ? 6 : 0) + (ux < 0 ? 3 : 0);
      out.push({ ...r, gap: g, bias });
    }
  }
  return out;
}

const W = { pill: 3.0, dot: 2.4, leaderPill: 420, leaderLeader: 150, len: 7.0, bias: 3 };

function cost(cand, idx, placed, items, dots, fixed) {
  let c = cand.gap * W.len + cand.bias * W.bias;
  for (const f of fixed) c += rectOverlap(cand, f) * W.pill;
  const pt = { x: items[idx].cx, y: items[idx].cy };
  const anch = leaderAnchor(cand, pt);

  for (const d of dots) c += rectOverlap(cand, d) * W.dot;

  for (let j = 0; j < placed.length; j++) {
    const o = placed[j];
    if (!o || j === idx) continue;
    c += rectOverlap(cand, o) * W.pill;
    if (segRect(anch, pt, o)) c += W.leaderPill;
    const oPt = { x: items[j].cx, y: items[j].cy };
    if (segSeg(anch, pt, leaderAnchor(o, oPt), oPt)) c += W.leaderLeader;
  }
  return c;
}

/**
 * items: [{ i, cx, cy, w, h }]  (cx/cy = point centre in px, w/h = pill size)
 *
 * Multi-start local search. A single greedy pass plus per-label re-picking gets stuck
 * in a local optimum (the same layout regardless of weights), so we restart from
 * several orderings and keep the cheapest result. Seeded throughout, so it is
 * deterministic: the same data always gives the same layout.
 */
export function solveLabels(items, bounds, dotR, seed = 0x9e3779b9, opts = {}) {
  const RESTARTS = opts.restarts ?? 120;
  const fixed = opts.fixed ?? [];   // axis notes etc. — immovable, must not be covered
  const PASSES = opts.passes ?? 40;

  const dots = items.map(it => ({
    x: it.cx - dotR - 2, y: it.cy - dotR - 2, w: (dotR + 2) * 2, h: (dotR + 2) * 2,
  }));
  const cands = items.map(it => candidates(it, bounds));

  // Any point whose every candidate is out of bounds falls back to a clamped slot.
  cands.forEach((list, i) => {
    if (list.length) return;
    const it = items[i];
    const x = Math.min(Math.max(it.cx - it.w / 2, bounds.x), bounds.x + bounds.w - it.w);
    const y = Math.min(Math.max(it.cy - it.h - 14, bounds.y), bounds.y + bounds.h - it.h);
    list.push({ x, y, w: it.w, h: it.h, gap: 14, bias: 0 });
  });

  // Densest neighbourhoods first: they have the fewest good options.
  const density = items.map((it, i) =>
    items.filter(o => o !== it && Math.hypot(o.cx - it.cx, o.cy - it.cy) < 130).length);
  const baseOrder = items.map((_, i) => i).sort((a, b) => density[b] - density[a]);

  const run = (rnd, order) => {
    const placed = new Array(items.length).fill(null);
    const pick = i => {
      let best = null, bc = Infinity;
      for (const c of cands[i]) {
        const v = cost(c, i, placed, items, dots, fixed);
        if (v < bc) { bc = v; best = c; }
      }
      return best;
    };
    for (const i of order) placed[i] = pick(i);

    const total = () => placed.reduce((a, _, i) => a + cost(placed[i], i, placed, items, dots, fixed), 0);
    let cur = total();
    for (let pass = 0; pass < PASSES; pass++) {
      let moved = false;
      for (const i of order) {
        const keep = placed[i];
        placed[i] = null;
        placed[i] = pick(i) || keep;
        if (placed[i] !== keep) moved = true;
      }
      const t = total();
      if (!moved || Math.abs(t - cur) < 1e-6) { cur = t; break; }
      cur = t;
    }
    return { pills: [...placed], score: cur };
  };

  const quality = pills => {
    let q = 0;
    for (let i = 0; i < pills.length; i++) {
      q += outsideArea(pills[i], bounds) * 50;
      for (const f of fixed) q += rectOverlap(pills[i], f) * 40;
      for (let j = i + 1; j < pills.length; j++) q += rectOverlap(pills[i], pills[j]) * 40;
    }
    const anch = pills.map((p, i) => leaderAnchor(p, { x: items[i].cx, y: items[i].cy }));
    for (let i = 0; i < pills.length; i++) {
      const pt = { x: items[i].cx, y: items[i].cy };
      q += Math.hypot(pt.x - anch[i].x, pt.y - anch[i].y);
      for (let j = 0; j < pills.length; j++) {
        if (i === j) continue;
        if (segRect(anch[i], pt, pills[j])) q += 900;
        if (j > i && segSeg(anch[i], pt, anch[j], { x: items[j].cx, y: items[j].cy })) q += 700;
      }
    }
    return q;
  };

  let best = null, bestQ = Infinity;
  for (let r = 0; r < RESTARTS; r++) {
    const rnd = mulberry32(seed + r * 0x9e37);
    // restart 0 uses the density order; later restarts jitter it to escape the
    // local optimum that a single ordering converges to
    let order = [...baseOrder];
    if (r > 0) {
      order = order
        .map(i => ({ i, k: density[i] + (rnd() - 0.5) * 6 }))
        .sort((a, b) => b.k - a.k).map(o => o.i);
    }
    const sol = run(rnd, order);
    const q = quality(sol.pills);
    if (q < bestQ) { bestQ = q; best = sol; }
  }
  return { ...best, quality: bestQ };
}

// How many leaders cross another leader or pass through another pill.
export function crossReport(pills, items) {
  let ll = 0, lp = 0;
  const anch = pills.map((p, i) => leaderAnchor(p, { x: items[i].cx, y: items[i].cy }));
  const pt = items.map(it => ({ x: it.cx, y: it.cy }));
  for (let i = 0; i < pills.length; i++) {
    for (let j = 0; j < pills.length; j++) {
      if (i === j) continue;
      if (segRect(anch[i], pt[i], pills[j])) lp++;
      if (j > i && segSeg(anch[i], pt[i], anch[j], pt[j])) ll++;
    }
  }
  return { leaderLeader: ll, leaderPill: lp };
}

// Leader-length stats: the objective for tuning label proximity.
export function leaderStats(pills, items) {
  const ds = pills.map((p, i) => {
    const pt = { x: items[i].cx, y: items[i].cy };
    const a = leaderAnchor(p, pt);
    return Math.max(0, Math.hypot(pt.x - a.x, pt.y - a.y));
  });
  const sum = ds.reduce((a, b) => a + b, 0);
  return { mean: sum / ds.length, max: Math.max(...ds), sum };
}

// Reported by the build so regressions in label packing are visible, not silent.
export function overlapReport(pills) {
  let worst = 0, total = 0, pairs = 0;
  for (let i = 0; i < pills.length; i++) {
    for (let j = i + 1; j < pills.length; j++) {
      const a = rectOverlap(pills[i], pills[j]);
      if (a > 0) { pairs++; total += a; worst = Math.max(worst, a); }
    }
  }
  return { pairs, total, worst };
}
