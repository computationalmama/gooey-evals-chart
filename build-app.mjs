#!/usr/bin/env node
// web/ + src/ + assets/ -> dist/app.html
//
// One self-contained file: the same renderer modules the CLI uses, every logo and motif
// as a data URI, and the app UI. Deploy by copying that one file anywhere; it also runs
// straight off the filesystem, so a colleague can double-click it.
//
// The renderer modules are ES modules that import each other. Rather than shipping a
// module graph (which browsers refuse to load over file://), each is wrapped into a
// registry entry — the source itself is untouched, so there is one implementation of
// the layout solver, not two.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { motifGroup } from "./src/assets.js";

// Order matters: a module may only import ones already registered.
const MODULES = ["tokens.js", "providers.js", "layout.js", "render.js", "csv.js",
                 "checks.js", "template.js"];

/** ES module -> `__M["name"] = (function(){ ... return {exports}; })();` */
function wrap(name, code) {
  const missing = [];
  code = code.replace(
    /^import\s*\{([^}]*)\}\s*from\s*"\.\/([\w.]+)";?[ \t]*$/gm,
    (_, names, dep) => {
      if (!MODULES.includes(dep)) missing.push(dep);
      return `const {${names.trim()}} = __M[${JSON.stringify(dep)}];`;
    });
  if (missing.length) throw new Error(`${name}: imports ${missing.join(", ")} — add it to MODULES`);
  const bad = /^\s*import\s|^\s*export\s+(default|\*|\{)/m.exec(code);
  if (bad) throw new Error(`${name}: unsupported module syntax "${bad[0].trim()}"`);

  const exported = [];
  code = code.replace(/^export\s+(function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm,
    (_, kw, id) => { exported.push(id); return `${kw} ${id}`; });
  if (!exported.length) throw new Error(`${name}: no exports found`);

  return `__M[${JSON.stringify(name)}] = (function () {\n${code}\n` +
         `return { ${exported.join(", ")} };\n})();`;
}

function dataUri(p) {
  return `data:image/png;base64,${readFileSync(p).toString("base64")}`;
}
function loadSet(dir, manifest) {
  const man = JSON.parse(readFileSync(join(dir, manifest), "utf8"));
  const out = {};
  for (const [id, v] of Object.entries(man)) {
    out[id] = { w: v.w, h: v.h, href: dataUri(join(dir, v.file)) };
  }
  return out;
}

// Every motif, not just one country: the app switches them without a rebuild.
function loadMotifs() {
  const out = {};
  for (const f of readdirSync("assets/motifs").filter(f => f.endsWith(".svg")).sort()) {
    const key = basename(f, ".svg");
    out[key === "default" ? "default" : key.toUpperCase()] =
      motifGroup(readFileSync(join("assets/motifs", f), "utf8"));
  }
  if (!out.default) throw new Error("assets/motifs/default.svg is missing");
  return out;
}

function loadExamples() {
  return readdirSync("charts").filter(f => /\.csv$/i.test(f)).sort().map(f => ({
    name: basename(f, ".csv"),
    csv: readFileSync(join("charts", f), "utf8"),
  }));
}

const baked = {
  logos: loadSet("assets/logos", "logos.manifest.json"),
  icons: loadSet("assets/icons", "icons.manifest.json"),
  motifs: loadMotifs(),
};
const examples = loadExamples();

const bundle = [
  "const __M = {};",
  ...MODULES.map(m => wrap(m, readFileSync(join("src", m), "utf8"))),
  `window.__BAKED__ = ${JSON.stringify(baked)};`,
  `window.__EXAMPLES__ = ${JSON.stringify(examples)};`,
  readFileSync("web/app.js", "utf8"),
].join("\n\n");

// template.js emits literal <script>, </script> and <!-- sequences inside its template
// strings. Left raw, the HTML tokenizer acts on them and tears this inlined <script>
// apart. A backslash before a non-escape character is dropped by JS, so the runtime
// strings are unchanged — this is purely to get the bytes past the HTML parser.
const inlineSafe = js => js
  .replace(/<\/script/gi, "<\\/script")
  .replace(/<script/gi, "<\\script")
  .replace(/<!--/g, "<\\!--");

const safe = inlineSafe(bundle);
const leak = /<\/?script|<!--/i.exec(safe);
if (leak) throw new Error(`bundle still exposes "${leak[0]}" to the HTML parser`);

const html = readFileSync("web/index.html", "utf8")
  .replace("/*__APP_CSS__*/", () => readFileSync("web/app.css", "utf8"))
  .replace("/*__APP_JS__*/", () => safe);

if (html.includes("__APP_CSS__") || html.includes("__APP_JS__")) {
  throw new Error("web/index.html lost one of its placeholders");
}

mkdirSync("dist", { recursive: true });
writeFileSync("dist/app.html", html);

const kb = n => `${(n / 1024).toFixed(1)} KB`;
console.log(`dist/app.html  ${kb(Buffer.byteLength(html))}`);
console.log(`  modules   ${MODULES.join(", ")}`);
console.log(`  assets    ${Object.keys(baked.logos).length} logos, ` +
            `${Object.keys(baked.icons).length} icons, ` +
            `${Object.keys(baked.motifs).length} motifs (${Object.keys(baked.motifs).join(", ")})`);
console.log(`  examples  ${examples.map(e => e.name).join(", ") || "none"}`);
console.log(`\nopen dist/app.html — or copy it to any static host`);
