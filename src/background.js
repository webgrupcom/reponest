// Toolbar button: toggles RepoNest on/off. Clicking also grants access to the current tab
// (activeTab), so the folder view works even when Chrome's site access is "on click".
const t = (key) => chrome.i18n.getMessage(key) || key;

async function isEnabled() {
  const { enabled } = await chrome.storage.local.get("enabled");
  return enabled !== false;
}

async function paintBadge() {
  const on = await isEnabled();
  await chrome.action.setBadgeText({ text: on ? t("badgeOn") : t("badgeOff") });
  await chrome.action.setBadgeBackgroundColor({ color: on ? "#1f883d" : "#6e7781" });
  await chrome.action.setTitle({ title: on ? t("actionOn") : t("actionOff") });
}

chrome.runtime.onInstalled.addListener(paintBadge);
chrome.runtime.onStartup.addListener(paintBadge);
chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.enabled) paintBadge(); });

async function isRunning(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: () => !!window.__repoNest });
    return !!(res && res.result);
  } catch (_) {
    return null; // not scriptable (not github.com, or no access)
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  const onGitHub = tab.id && /^https:\/\/github\.com\//.test(tab.url || "");
  const running = onGitHub ? await isRunning(tab.id) : null;
  if (running === false) {
    // Site access was "on click": start RepoNest in this tab instead of toggling it off.
    await chrome.storage.local.set({ enabled: true });
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["src/content.css"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/rules.js", "src/content.js"] });
    return;
  }
  await chrome.storage.local.set({ enabled: !(await isEnabled()) });
});
