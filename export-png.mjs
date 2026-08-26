#!/usr/bin/env node
// dist/*.html -> dist/*@2x.png  (retina raster for decks, social and partner reports)
import { readdirSync, existsSync, renameSync, rmSync, mkdtempSync } from "node:fs";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const CHROME = process.env.CHROME ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const W = 1413, H = 752, SCALE = Number(process.env.SCALE || 2);

// Only real charts: index.html is the gallery, app.html is the chart maker, and
// *.embed.html is the same chart again as a paste-in snippet.
const isChart = f => /\.html$/.test(f) && !/^(index|app)\.html$/.test(f) && !/\.embed\.html$/.test(f);

const args = process.argv.slice(2);
const files = args.length ? args
  : readdirSync("dist").filter(isChart).map(f => join("dist", f));
if (!files.length) { console.error("nothing in dist/ — run `node build.mjs` first"); process.exit(1); }

let failed = 0;
for (const f of files) {
  const out = f.replace(/\.html$/, `@${SCALE}x.png`);
  const dir = mkdtempSync(join(tmpdir(), "evalshot-"));
  try {
    execFileSync(CHROME, [
      "--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
      "--allow-file-access-from-files", "--virtual-time-budget=15000",
      `--force-device-scale-factor=${SCALE}`,
      `--window-size=${W},${H}`,
      `--screenshot=${join(dir, "s.png")}`,
      `file://${join(process.cwd(), f)}`,
    ], { stdio: ["ignore", "ignore", "ignore"] });
    if (!existsSync(join(dir, "s.png"))) throw new Error("Chrome wrote no screenshot");
    renameSync(join(dir, "s.png"), out);
    console.log(`  ${basename(out)}  ${SCALE}x  (${W * SCALE}x${H * SCALE})`);
  } catch (e) {
    console.error(`  FAIL ${basename(f)}: ${e.message}`);
    failed++;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
process.exit(failed ? 1 : 0);
