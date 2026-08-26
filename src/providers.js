// Map a workflow name to provider logo chips.
// "GPT 5.6 Sol + Intron" -> lead: openai, trail: [intron]
// "Kimi K3 + Omni"       -> lead: moonshot, trail: [meta]

const RULES = [
  [/\bgpt\b|openai|^o[0-9]/i, "openai"],
  [/claude|fable/i,           "anthropic"],
  [/gemini|palm|bard/i,       "google"],
  [/kimi|moonshot|\bk[0-9]/i, "moonshot"],
  [/minimax/i,                "minimax"],
  [/omni|llama|\bmeta\b/i,    "meta"],
  [/intron/i,                 "intron"],
  [/gooey/i,                  "gooey"],
];

export function providerFor(segment) {
  for (const [re, id] of RULES) if (re.test(segment)) return id;
  return null;
}

export function chipsFor(name) {
  const parts = String(name).split(/\s*\+\s*/).filter(Boolean);
  const lead = parts.length ? providerFor(parts[0]) : null;
  const trail = parts.slice(1).map(providerFor);
  return {
    lead,
    trail: trail.filter(Boolean),
    // segments that matched nothing, so the build can warn instead of failing quietly
    unknown: parts.filter(p => !providerFor(p)),
  };
}
