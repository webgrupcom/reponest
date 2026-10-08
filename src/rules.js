// Folder rules. Stored in chrome.storage.sync under "rules"; editable on the options page.
// With rules: a repo goes to the first folder whose name prefix matches, then the first whose topic matches.
// Without rules (default): automatic mode — each repo goes to its most common topic across the org.
const RN_EXAMPLE_RULES = [
  { name: "Clients",  color: "#3fb950", prefixes: ["client-"],  topics: ["client"] },
  { name: "Products", color: "#a371f7", prefixes: ["product-"], topics: ["product"] },
  { name: "Mobile",   color: "#db61a2", prefixes: ["mobile-", "ios-", "android-"], topics: ["mobile", "ios", "android"] },
  { name: "Tools",    color: "#768390", prefixes: ["tool-"],    topics: ["tool", "tools"] }
];

const RN_PALETTE = ["#4493f8", "#3fb950", "#a371f7", "#db61a2", "#d29922", "#e5534b", "#39c5cf", "#f0883e", "#768390"];

function rnTitle(s) {
  return s.replace(/[-_]+/g, " ").replace(/^\p{L}/u, (c) => c.toLocaleUpperCase());
}

// Returns [{ key, name, color, match(repo) }] in display order; repos matching nothing go to "Other".
function rnFolders(repos, rules) {
  if (rules && rules.length) {
    return rules.map((r) => ({ key: r.name, name: r.name, color: r.color || "#768390", rule: r }));
  }
  const freq = new Map();
  for (const r of repos) for (const t of r.topics) freq.set(t, (freq.get(t) || 0) + 1);
  const used = new Set(repos.map((r) => rnAutoTopic(r, freq)).filter(Boolean));
  return [...used]
    .sort((a, b) => (freq.get(b) - freq.get(a)) || a.localeCompare(b))
    .map((t, i) => ({ key: t, name: rnTitle(t), color: RN_PALETTE[i % RN_PALETTE.length], topic: t, freq }));
}

function rnAutoTopic(repo, freq) {
  let best = null;
  for (const t of repo.topics) if (!best || freq.get(t) > freq.get(best)) best = t;
  return best;
}

function rnAssign(repo, folders) {
  if (!folders.length) return null;
  if (folders[0].rule) {
    const name = repo.name.toLowerCase();
    for (const f of folders) {
      if ((f.rule.prefixes || []).some((p) => p && name.startsWith(p.toLowerCase()))) return f.key;
    }
    const topics = repo.topics.map((t) => t.toLowerCase());
    for (const f of folders) {
      if ((f.rule.topics || []).some((t) => t && topics.includes(t.toLowerCase()))) return f.key;
    }
    return null;
  }
  return rnAutoTopic(repo, folders[0].freq);
}

async function rnLoadRules() {
  try {
    const { rules } = await chrome.storage.sync.get("rules");
    if (Array.isArray(rules)) return rules;
  } catch (_) { /* storage unavailable → automatic */ }
  return [];
}
