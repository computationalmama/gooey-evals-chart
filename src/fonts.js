// Per-chart font subsetting. Google Fonts' &text= endpoint returns a woff2 holding
// exactly the glyphs asked for: ~18KB for a whole chart vs ~161KB for full latin
// subsets, and it works for any script (Devanagari, etc.) without guessing subsets.
// Results are cached on disk so rebuilds are offline and reproducible.

import { createHash } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const CACHE = "assets/fonts/cache";

const key = (family, weight, chars) =>
  createHash("sha256").update(`${family}|${weight}|${chars}`).digest("hex").slice(0, 20);

async function subset(family, weight, chars) {
  mkdirSync(CACHE, { recursive: true });
  const k = key(family, weight, chars);
  const file = join(CACHE, `${k}.woff2`);
  if (existsSync(file)) return { buf: readFileSync(file), cached: true };

  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}` +
              `:wght@${weight}&text=${encodeURIComponent(chars)}`;
  let css;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    css = await res.text();
  } catch (e) {
    throw new Error(
      `Could not fetch a "${family}" ${weight} subset (${e.message}).\n` +
      `  This chart needs glyphs that are not in assets/fonts/cache yet, so the\n` +
      `  first build of new text requires network access. Cached builds work offline.`);
  }
  const m = /url\((https:[^)]+)\)/.exec(css);
  if (!m) throw new Error(`No font URL in the Google Fonts response for ${family} ${weight}`);
  const buf = Buffer.from(await (await fetch(m[1], { headers: { "User-Agent": UA } })).arrayBuffer());
  writeFileSync(file, buf);
  return { buf, cached: false };
}

/** specs: [{family, weight}]; chars: the exact characters that font must cover */
export async function inlineFonts(specs, charsBySpec) {
  const faces = [];
  let bytes = 0, fetched = 0;
  for (const { family, weight } of specs) {
    const chars = [...new Set([...(charsBySpec.get(`${family}|${weight}`) || "")])].sort().join("");
    if (!chars) continue;
    const { buf, cached } = await subset(family, weight, chars);
    bytes += buf.length;
    if (!cached) fetched++;
    faces.push(
      `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};` +
      `font-display:block;src:url(data:font/woff2;base64,${buf.toString("base64")}) format('woff2')}`);
  }
  return { css: faces.join("\n"), bytes, fetched };
}
