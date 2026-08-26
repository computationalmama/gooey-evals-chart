// Inline the extracted logo/icon PNGs and the country motif as data URIs, so a built
// chart is one file with no external requests.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dataUri = p => `data:image/png;base64,${readFileSync(p).toString("base64")}`;

function loadSet(dir, manifest) {
  const man = JSON.parse(readFileSync(join(dir, manifest), "utf8"));
  const out = {};
  for (const [id, v] of Object.entries(man)) {
    out[id] = { w: v.w, h: v.h, href: dataUri(join(dir, v.file)) };
  }
  return out;
}

// Strip the wrapper so the tile's paths can go straight into an SVG <pattern>.
// Exported (and pure) because the browser chart maker bakes every motif the same way.
export function motifGroup(raw) {
  const inner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(raw)?.[1] ?? "";
  const attrs = /<svg([^>]*)>/.exec(raw)?.[1] ?? "";
  const pick = k => new RegExp(`${k}="([^"]*)"`).exec(attrs)?.[1];
  return `<g fill="${pick("fill") || "none"}" stroke="${pick("stroke") || "currentColor"}" ` +
         `stroke-width="${pick("stroke-width") || "1"}">${inner.trim()}</g>`;
}

function loadMotif(country) {
  const file = country && existsSync(`assets/motifs/${country}.svg`)
    ? `assets/motifs/${country}.svg`
    : "assets/motifs/default.svg";
  return { motif: motifGroup(readFileSync(file, "utf8")), motifFile: file };
}

export function loadAssets(country) {
  return {
    logos: loadSet("assets/logos", "logos.manifest.json"),
    icons: loadSet("assets/icons", "icons.manifest.json"),
    ...loadMotif(country),
  };
}
