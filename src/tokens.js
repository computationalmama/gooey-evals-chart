// Design tokens + geometry, all measured off the reference infographic
// (see tools/ for the probes that produced these numbers).

export const CANVAS = { w: 1413, h: 752 };
export const CARD = { x: 36, y: 153, w: 1354, h: 550, r: 26 };

// Plot rect: x 123->1346 (=122.3px per 0.1 accuracy), y 624->206 (=59.71px per 5s)
export const PLOT = { l: 123, r: 1346, t: 206, b: 624 };

export const C = {
  bg: "#ffffff",
  halftone: "#ebfffd",     // brand dot texture
  highlight: "#bfe6e1",    // Fastest / Most Accurate fill
  highlightStroke: "#68ada6",
  point: "#dec09c",        // default point circle
  pointStroke: "#b08d5f",
  pill: "#ffffff",
  pillStroke: "#2a2a2a",
  card: "#ffffff",
  cardStroke: "#ececec",
  axis: "#bdbdbd",
  grid: "#e5e6e6",
  leader: "#8a8a8a",
  ink: "#111111",
  ink2: "#333333",
  motif: "#d7eae8",
};

export const TYPE = {
  title:    { family: "Domine", weight: 700, size: 52 },
  subtitle: { family: "Inter",  weight: 400, size: 21 },
  axisName: { family: "Inter",  weight: 400, size: 22 },
  tick:     { family: "Inter",  weight: 400, size: 18 },
  note:     { family: "Inter",  weight: 400, size: 15 },
  label:    { family: "Inter",  weight: 400, size: 14 },
  badge:    { family: "Inter",  weight: 600, size: 15 },
  pointNum: { family: "Inter",  weight: 600, size: 12 },
  footer:   { family: "Inter",  weight: 400, size: 19 },
};

// Text block anchors (baselines), measured from the reference
export const ANCHOR = {
  titleBaseline: 92,
  subtitleBaseline: 129,
  footerBaseline: 731,
  xAxisNameBaseline: 686,   // centred on the plot, not the canvas
  yAxisNameCentre: 396,     // rotated -90 at x=72
  yAxisNameX: 72,
  tickGapX: 10,             // y-tick labels right-aligned this far left of the axis
  tickBaselineGapY: 26,     // x-tick baseline below the axis
};

export const PILL = { h: 26, r: 10, padX: 6, gap: 5, stroke: 1.6, chip: 19 };
export const POINT = { r: 9.5, stroke: 1.6 };
export const LEADER = { width: 1.4 };
