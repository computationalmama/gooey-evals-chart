// Assemble the final self-contained page: inlined fonts, the static SVG, and a small
// progressive-enhancement tooltip. The chart is fully visible with JS disabled.

export function page({ title, description, fontCss, svg }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<style>
${fontCss}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
body{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
#wrap{width:100%;max-width:1413px;margin:0 auto}
svg{display:block;width:100%;height:auto}
.gc-pill,.gc-dot{cursor:default;transition:opacity .12s ease}
body.gc-hot .gc-pill:not(.gc-on),body.gc-hot .gc-dot:not(.gc-on){opacity:.45}
#tip{position:fixed;z-index:9;pointer-events:none;opacity:0;transform:translate(-50%,-130%);
  background:#111;color:#fff;font:500 13px/1.45 Inter,system-ui,sans-serif;
  padding:7px 10px;border-radius:8px;white-space:nowrap;transition:opacity .12s ease;
  box-shadow:0 6px 20px rgba(0,0,0,.22)}
#tip b{font-weight:700}
#tip.show{opacity:1}
@media (prefers-reduced-motion:reduce){.gc-pill,.gc-dot,#tip{transition:none}}
</style>
</head>
<body>
<div id="wrap">
${svg}
</div>
<div id="tip" role="status" aria-live="polite"></div>
<script>
(function(){
  var tip=document.getElementById("tip"), svg=document.querySelector("svg"), cur=null;
  if(!svg) return;
  // Native <title> tooltips are the no-JS baseline; move them aside so the styled
  // tooltip below doesn't fight the browser's own.
  var groups=[].slice.call(svg.querySelectorAll(".gc-pill,.gc-dot"));
  groups.forEach(function(g){
    var t=g.querySelector("title");
    if(t){ g.setAttribute("data-tip", t.textContent); t.remove(); }
  });
  function byIndex(i){ return groups.filter(function(g){ return g.getAttribute("data-i")===i; }); }
  function show(g,e){
    var i=g.getAttribute("data-i"), txt=g.getAttribute("data-tip")||"";
    var parts=txt.split(" — ");
    tip.innerHTML="<b>"+parts[0]+"</b>"+(parts[1]?" · "+parts[1]:"");
    tip.classList.add("show");
    tip.style.left=e.clientX+"px"; tip.style.top=e.clientY+"px";
    if(cur!==i){
      document.body.classList.add("gc-hot");
      groups.forEach(function(x){ x.classList.remove("gc-on"); });
      byIndex(i).forEach(function(x){ x.classList.add("gc-on"); });
      cur=i;
    }
  }
  function hide(){
    tip.classList.remove("show"); document.body.classList.remove("gc-hot");
    groups.forEach(function(x){ x.classList.remove("gc-on"); }); cur=null;
  }
  groups.forEach(function(g){
    g.addEventListener("mouseenter", function(e){ show(g,e); });
    g.addEventListener("mousemove", function(e){ show(g,e); });
    g.addEventListener("mouseleave", hide);
  });
  svg.addEventListener("mouseleave", hide);
})();
</script>
</body>
</html>
`;
}

// Harness used only at build time: loads the fonts, runs the renderer in Chrome and
// leaves the result in the DOM for --dump-dom to collect.
export function harness({ fontCss, dataJson, srcMap }) {
  const mods = Object.entries(srcMap)
    .map(([name, code]) => `  ${JSON.stringify(name)}: ${JSON.stringify(code)}`).join(",\n");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>layout harness</title>
<style>${fontCss}
body{margin:0;font-family:Inter,sans-serif}</style>
</head><body>
<div id="out">PENDING</div>
<script type="module">
const SRC = {
${mods}
};
// Wire the ES modules together via blob URLs so render.js can import its siblings.
const urls = {};
const order = ["tokens.js","providers.js","layout.js","render.js"];
for (const name of order) {
  let code = SRC[name];
  code = code.replace(/from\\s+"\\.\\/([\\w.]+)"/g, (m, dep) => 'from ' + JSON.stringify(urls[dep]));
  urls[name] = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
}
const { renderChart } = await import(urls["render.js"]);
const data = ${dataJson};
const assets = window.__ASSETS__;
await document.fonts.load('700 45px Domine');
await document.fonts.load('400 17px Inter');
await document.fonts.load('600 15px Inter');
await document.fonts.ready;
const res = renderChart(data, assets);
const holder = document.createElement("div");
holder.id = "result";
holder.setAttribute("data-warnings", JSON.stringify(res.warnings));
holder.setAttribute("data-overlaps", JSON.stringify(res.overlaps));
holder.setAttribute("data-score", String(res.score));
holder.setAttribute("data-leaders", JSON.stringify(res.leaders));
holder.setAttribute("data-crosses", JSON.stringify(res.crosses));
holder.appendChild(document.createComment("SVG-START"));
const pre = document.createElement("script");
pre.type = "text/plain";
pre.id = "svgout";
pre.textContent = res.svg;
holder.appendChild(pre);
document.getElementById("out").replaceWith(holder);
</script>
</body></html>
`;
}

/**
 * Paste-ready snippet for a Webflow HTML Embed (or any CMS that takes raw HTML).
 *
 * Differences from the standalone page: fonts come from Google Fonts rather than being
 * inlined (keeps it under Webflow's ~50,000-character Embed limit), every style is
 * scoped so nothing leaks into the host page, and the tooltip is bound to this chart's
 * own root so two charts can sit on one page.
 */
export function webflowEmbed({ svg, slug, title }) {
  const root = `gc-${slug}`;
  return `<!-- Gooey.AI eval chart: ${title} -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Domine:wght@700&family=Inter:wght@400;600;700&display=block">
<style>
#${root}{width:100%;max-width:1413px;margin:0 auto}
#${root} svg{display:block;width:100%;height:auto;border:0;outline:0;
  box-shadow:none;background:none;max-width:none}
#${root} .gc-pill,#${root} .gc-dot{transition:opacity .12s ease}
#${root}.gc-hot .gc-pill:not(.gc-on),#${root}.gc-hot .gc-dot:not(.gc-on){opacity:.45}
#${root}-tip{position:fixed;z-index:9999;pointer-events:none;opacity:0;
  transform:translate(-50%,-130%);background:#111;color:#fff;
  font:500 13px/1.45 Inter,system-ui,sans-serif;padding:7px 10px;border-radius:8px;
  white-space:nowrap;transition:opacity .12s ease;box-shadow:0 6px 20px rgba(0,0,0,.22)}
#${root}-tip.show{opacity:1}
@media (prefers-reduced-motion:reduce){#${root} .gc-pill,#${root} .gc-dot,#${root}-tip{transition:none}}
</style>
<div id="${root}">
${svg}
</div>
<div id="${root}-tip" role="status" aria-live="polite"></div>
<script>
(function(){
  var root=document.getElementById("${root}"), tip=document.getElementById("${root}-tip");
  if(!root||!tip) return;
  var groups=[].slice.call(root.querySelectorAll(".gc-pill,.gc-dot")), cur=null;
  groups.forEach(function(g){
    var t=g.querySelector("title");
    if(t){ g.setAttribute("data-tip", t.textContent); t.remove(); }
  });
  function show(g,e){
    var i=g.getAttribute("data-i"), p=(g.getAttribute("data-tip")||"").split(" \u2014 ");
    tip.innerHTML="<b>"+p[0]+"</b>"+(p[1]?" \u00b7 "+p[1]:"");
    tip.classList.add("show");
    tip.style.left=e.clientX+"px"; tip.style.top=e.clientY+"px";
    if(cur!==i){
      root.classList.add("gc-hot");
      groups.forEach(function(x){ x.classList.remove("gc-on"); });
      groups.filter(function(x){ return x.getAttribute("data-i")===i; })
            .forEach(function(x){ x.classList.add("gc-on"); });
      cur=i;
    }
  }
  function hide(){
    tip.classList.remove("show"); root.classList.remove("gc-hot");
    groups.forEach(function(x){ x.classList.remove("gc-on"); }); cur=null;
  }
  groups.forEach(function(g){
    g.addEventListener("mouseenter",function(e){ show(g,e); });
    g.addEventListener("mousemove",function(e){ show(g,e); });
    g.addEventListener("mouseleave",hide);
  });
  root.addEventListener("mouseleave",hide);
})();
</script>`;
}
