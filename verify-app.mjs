#!/usr/bin/env node
// Parity check: the chart dist/app.html produces in a browser must be the chart
// `node build.mjs` produces on the command line — same SVG, byte for byte.
//
// Run after `node build.mjs && node build-app.mjs`. Needs network the first time,
// because the app fetches its font subsets from Google Fonts rather than the disk cache.

import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const CHROME = process.env.CHROME ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

if (!existsSync("dist/app.html")) {
  console.error("dist/app.html is missing — run `node build-app.mjs` first");
  process.exit(1);
}
const app = readFileSync("dist/app.html", "utf8");

const args = process.argv.slice(2);
const files = args.length ? args
  : ["charts/yoruba-2026-08-13.csv", "charts/kannada-2026-08-05.csv"].filter(existsSync);

let failed = 0;
for (const csvPath of files) {
  const name = basename(csvPath).replace(/\.csv$/i, "");
  const built = join("dist", `${name}.html`);
  if (!existsSync(built)) {
    console.log(`  SKIP ${name} — ${built} not built yet`);
    continue;
  }

  const driver = `
<script>
(async () => {
  const out = m => {
    const p = document.createElement("script");
    p.type = "text/plain"; p.id = "svgout"; p.textContent = m;
    document.body.appendChild(p);
    document.body.setAttribute("data-done", "1");
  };
  try {
    window.GC.ingest(${JSON.stringify(readFileSync(csvPath, "utf8"))});
    await window.GC.render();
    out(window.GC.state.last ? window.GC.state.last.svg : "NO-RENDER");
  } catch (e) { out("ERROR: " + e.message); }
})();
</script>`;

  // Splice at the *last* </body>: the bundle contains template.js, whose template
  // strings hold </body> and </head> of their own.
  const at = app.lastIndexOf("</body>");
  if (at < 0) throw new Error("dist/app.html has no </body>");
  const tmp = join(tmpdir(), `evalapp-verify-${name}-${process.pid}.html`);
  writeFileSync(tmp, app.slice(0, at) + driver + "\n" + app.slice(at));
  let dom;
  try {
    dom = execFileSync(CHROME, [
      "--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
      "--allow-file-access-from-files", "--virtual-time-budget=40000",
      "--dump-dom", `file://${tmp}`,
    ], { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
  } finally { rmSync(tmp, { force: true }); }

  const got = /<script type="text\/plain" id="svgout">([\s\S]*?)<\/script>/.exec(dom)?.[1];
  if (!got || got.startsWith("ERROR:") || got === "NO-RENDER") {
    console.log(`  FAIL ${name} — app produced no chart (${got || "no #svgout in the DOM"})`);
    failed++;
    continue;
  }

  const want = /<div id="wrap">\s*([\s\S]*?)\s*<\/div>/.exec(readFileSync(built, "utf8"))?.[1];
  if (!want) { console.log(`  FAIL ${name} — no SVG found in ${built}`); failed++; continue; }

  if (got.trim() === want.trim()) {
    console.log(`  ok   ${name} — identical to ${built} (${got.length.toLocaleString()} chars)`);
  } else {
    failed++;
    const a = got.trim().split("\n"), b = want.trim().split("\n");
    const i = a.findIndex((l, k) => l !== b[k]);
    console.log(`  FAIL ${name} — differs from ${built} at line ${i + 1} of ${b.length}`);
    console.log(`         app: ${String(a[i]).slice(0, 150)}`);
    console.log(`         cli: ${String(b[i]).slice(0, 150)}`);
  }
}
console.log(failed ? `\n${failed} chart(s) differ` : `\nok — browser and CLI agree`);
process.exit(failed ? 1 : 0);
