// RepoNest — turns github.com/orgs/<org>/repositories into a folder view.
// Repository data comes from GitHub's own page endpoint (Accept: application/json) using the
// user's existing session. Nothing is sent anywhere else.
(() => {
  if (window.__repoNest) return;
  window.__repoNest = true;

  const ROUTE = /^\/orgs\/([^/]+)\/repositories\/?$/;
  const LIST_SEL = '[class*="repositoriesListWrapper"]';
  const CACHE_MS = 60 * 1000;
  const OTHER = "\u0000other";

  const t = (key) => (chrome.i18n && chrome.i18n.getMessage(key)) || key;
  let current = null; // { org, root, repos, rules }

  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* ignore */ } }
  };

  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c != null) n.append(c);
    return n;
  }

  // Small stroke icons (16×16), drawn with currentColor so they follow GitHub's theme.
  const SVGNS = "http://www.w3.org/2000/svg";
  const ICONS = {
    expand: ["M4 6.5l4-4 4 4", "M4 9.5l4 4 4-4"],
    collapse: ["M4 2.5l4 4 4-4", "M4 13.5l4-4 4 4"],
    list: ["M2.5 4h11", "M2.5 8h11", "M2.5 12h11"],
    grid: ["M2.5 2.5h4.5v4.5H2.5z", "M9 2.5h4.5v4.5H9z", "M2.5 9h4.5v4.5H2.5z", "M9 9h4.5v4.5H9z"],
    refresh: ["M13.5 8a5.5 5.5 0 1 1-1.6-3.9", "M12.5 1.5v3h-3"],
    sortAsc: ["M5 13.5v-11", "M2 5.5l3-3 3 3", "M10 4h2", "M10 8h3", "M10 12h4"],
    sortDesc: ["M5 2.5v11", "M2 10.5l3 3 3-3", "M10 4h4", "M10 8h3", "M10 12h2"],
    back: ["M10 3L5 8l5 5"],
    up: ["M4 10l4-4 4 4"],
    down: ["M4 6l4 4 4-4"]
  };
  function icon(name) {
    const svg = document.createElementNS(SVGNS, "svg");
    for (const [k, v] of Object.entries({ viewBox: "0 0 16 16", width: "16", height: "16", "aria-hidden": "true", class: "rn-ic" })) svg.setAttribute(k, v);
    for (const d of ICONS[name]) {
      const path = document.createElementNS(SVGNS, "path");
      path.setAttribute("d", d);
      svg.append(path);
    }
    return svg;
  }
  const iconBtn = (name, label, onclick, extra = "") =>
    el("button", { class: "rn-btn rn-icon-btn " + extra, type: "button", title: label, "aria-label": label, onclick }, icon(name));

  const rtf = new Intl.RelativeTimeFormat(navigator.language, { numeric: "auto" });
  function ago(iso) {
    if (!iso) return "";
    let v = (new Date(iso).getTime() - Date.now()) / 1000;
    const steps = [[60, "second"], [60, "minute"], [24, "hour"], [30, "day"], [12, "month"], [Infinity, "year"]];
    for (const [n, unit] of steps) {
      if (Math.abs(v) < n) return rtf.format(Math.round(v), unit);
      v /= n;
    }
    return "";
  }

  async function fetchPage(org, page) {
    const r = await fetch(`/orgs/${encodeURIComponent(org)}/repositories?page=${page}`, {
      headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      credentials: "same-origin"
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    return (j.payload && j.payload.orgReposPageRoute) || {};
  }

  function mapRepo(x) {
    return {
      name: x.name,
      owner: x.owner,
      private: /private|internal/i.test(x.type || ""),
      archived: /archive/i.test(x.type || ""),
      fork: !!x.isFork,
      description: x.description || "",
      topics: x.allTopics || [],
      lang: x.primaryLanguage ? x.primaryLanguage.name : "",
      langColor: x.primaryLanguage ? x.primaryLanguage.color : "",
      updated: x.lastUpdated ? x.lastUpdated.timestamp : null
    };
  }

  async function loadRepos(org, force) {
    const key = "rn:data:" + org;
    const cached = ls.get(key, null);
    if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.repos;
    const first = await fetchPage(org, 1);
    let all = (first.repositories || []).slice();
    const pages = first.pageCount || 1;
    const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => fetchPage(org, i + 2)));
    for (const p of rest) all = all.concat(p.repositories || []);
    const repos = all.map(mapRepo);
    ls.set(key, { at: Date.now(), repos });
    return repos;
  }

  function sorter(sort) {
    const dir = sort.dir === "desc" ? -1 : 1;
    const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    if (sort.by === "updated") {
      return (a, b) => dir * ((new Date(a.updated || 0)) - (new Date(b.updated || 0))) || byName(a, b);
    }
    return (a, b) => dir * byName(a, b);
  }

  function group(repos, allRepos, rules, sort = { by: "name", dir: "asc" }, order = []) {
    const folders = rnFolders(allRepos, rules);
    const map = new Map(folders.map((f) => [f.key, []]));
    map.set(OTHER, []);
    for (const r of repos) {
      const k = rnAssign(r, folders);
      (map.get(k) || map.get(OTHER)).push(r);
    }
    const cmp = sorter(sort);
    for (const list of map.values()) list.sort(cmp);
    const latest = (f) => Math.max(0, ...map.get(f.key).map((r) => new Date(r.updated || 0).getTime()));
    const dir = sort.dir === "desc" ? -1 : 1;
    const ordered = sort.by === "updated"
      ? folders.slice().sort((a, b) => dir * (latest(a) - latest(b)))
      : applyOrder(folders, order);
    return ordered
      .concat([{ key: OTHER, name: t("other"), color: "#768390" }])
      .map((f) => ({ ...f, repos: map.get(f.key) }))
      .filter((g) => g.repos.length);
  }

  // User-defined folder order (▲/▼ on each folder); folders not in the saved order keep their place after it.
  function applyOrder(folders, order) {
    if (!order || !order.length) return folders;
    const pos = (f) => { const i = order.indexOf(f.key); return i < 0 ? order.length + folders.indexOf(f) : i; };
    return folders.slice().sort((a, b) => pos(a) - pos(b));
  }

  function moveFolder(org, key, delta) {
    const keys = group(current.repos, current.repos, current.rules, undefined, ls.get("rn:order:" + org, []))
      .map((g) => g.key).filter((k) => k !== OTHER);
    const i = keys.indexOf(key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    ls.set("rn:order:" + org, keys);
    render();
  }

  function repoRow(r) {
    const meta = el("div", { class: "rn-meta" },
      r.lang ? el("span", { class: "rn-lang" }, el("span", { class: "rn-dot", style: `background:${r.langColor || "#768390"}` }), r.lang) : null,
      r.updated ? el("span", { title: new Date(r.updated).toLocaleString(), text: ago(r.updated) }) : null
    );
    return el("li", { class: "rn-repo" + (r.archived ? " rn-archived" : "") },
      el("div", { class: "rn-repo-head" },
        el("a", { class: "rn-name", href: `/${r.owner}/${r.name}`, text: r.name }),
        el("span", { class: "rn-badge", text: r.archived ? t("archived") : r.private ? t("private") : t("public") }),
        r.fork ? el("span", { class: "rn-badge", text: t("fork") }) : null
      ),
      r.description ? el("p", { class: "rn-desc", text: r.description }) : null,
      el("div", { class: "rn-foot" },
        el("div", { class: "rn-topics" }, r.topics.map((tp) =>
          el("a", { class: "rn-topic", href: `/search?q=${encodeURIComponent(`org:${r.owner} topic:${tp}`)}&type=repositories`, text: tp }))),
        meta
      )
    );
  }

  function render() {
    if (!current) return;
    const { org, root, repos, rules } = current;
    const q = (root.querySelector(".rn-search").value || "").trim().toLowerCase();
    const collapsed = ls.get("rn:collapsed:" + org, {});
    const body = root.querySelector(".rn-body");
    body.textContent = "";

    const filtered = q
      ? repos.filter((r) => (r.name + " " + r.description + " " + r.topics.join(" ")).toLowerCase().includes(q))
      : repos;
    const allGroups = group(filtered, repos, rules, getSort(org), ls.get("rn:order:" + org, []));
    const hidden = new Set(ls.get("rn:hidden:" + org, []));
    const groups = allGroups.filter((g) => !hidden.has(g.key));
    const shown = groups.reduce((n, g) => n + g.repos.length, 0);
    root.querySelector(".rn-count").textContent =
      (shown !== repos.length ? `${shown} / ${repos.length}` : `${repos.length}`) + " " + t("repos");
    renderFilter(org, group(repos, repos, rules, undefined, ls.get("rn:order:" + org, [])), hidden);

    if (!groups.length) {
      body.append(el("div", { class: "rn-empty", text: t("noMatch") }));
      return;
    }
    if (ls.get("rn:view:" + org, "list") === "grid") {
      renderGrid(org, body, groups);
      return;
    }
    const manualOrder = !q && getSort(org).by !== "updated";
    for (const g of groups) {
      const open = q ? true : !collapsed[g.key];
      const movable = g.key !== OTHER && manualOrder;
      const toggle = el("button", {
        class: "rn-folder-toggle", type: "button", "aria-expanded": String(open),
        onclick: () => {
          const c = ls.get("rn:collapsed:" + org, {});
          c[g.key] = folder.classList.contains("rn-open");
          ls.set("rn:collapsed:" + org, c);
          folder.classList.toggle("rn-open");
          toggle.setAttribute("aria-expanded", String(folder.classList.contains("rn-open")));
        }
      },
        el("span", { class: "rn-chev", "aria-hidden": "true" }),
        el("span", { class: "rn-folder-icon", style: `color:${g.color}`, "aria-hidden": "true" }),
        el("span", { class: "rn-folder-name", text: g.name }),
        el("span", { class: "rn-folder-count", text: String(g.repos.length) })
      );
      const folder = el("section", { class: "rn-folder" + (open ? " rn-open" : "") },
        el("div", { class: "rn-folder-head" },
          toggle,
          movable ? el("span", { class: "rn-move" },
            el("button", { class: "rn-move-btn", type: "button", title: t("moveUp"), "aria-label": `${g.name}: ${t("moveUp")}`, onclick: () => moveFolder(org, g.key, -1) }, icon("up")),
            el("button", { class: "rn-move-btn", type: "button", title: t("moveDown"), "aria-label": `${g.name}: ${t("moveDown")}`, onclick: () => moveFolder(org, g.key, 1) }, icon("down"))
          ) : null
        ),
        el("ul", { class: "rn-list" }, g.repos.map(repoRow))
      );
      body.append(folder);
    }
  }

  // Grid view: folders as tiles; clicking a tile opens the folder and shows its repos as cards.
  function renderGrid(org, body, groups) {
    const open = groups.find((g) => g.key === current.openFolder);
    if (open) {
      body.append(
        el("div", { class: "rn-crumb" },
          el("button", { class: "rn-btn rn-back", type: "button", onclick: () => { current.openFolder = null; render(); } },
            icon("back"), el("span", { text: t("title") })),
          el("span", { class: "rn-folder-icon", style: `color:${open.color}`, "aria-hidden": "true" }),
          el("strong", { text: open.name }),
          el("span", { class: "rn-folder-count", text: String(open.repos.length) })
        ),
        el("ul", { class: "rn-cards" }, open.repos.map(repoRow))
      );
      return;
    }
    current.openFolder = null;
    body.append(el("div", { class: "rn-tiles" }, groups.map((g) => {
      const last = g.repos.reduce((m, r) => (r.updated && (!m || r.updated > m) ? r.updated : m), null);
      return el("button", { class: "rn-tile", type: "button", onclick: () => { current.openFolder = g.key; render(); } },
        el("span", { class: "rn-tile-icon", style: `color:${g.color}`, "aria-hidden": "true" }),
        el("span", { class: "rn-tile-name", text: g.name }),
        el("span", { class: "rn-tile-meta", text: `${g.repos.length} ${t("repos")}` + (last ? ` · ${ago(last)}` : "") })
      );
    })));
  }

  function renderFilter(org, allGroups, hidden) {
    const menu = current.root.querySelector(".rn-filter-list");
    const btn = current.root.querySelector(".rn-filter-btn");
    const visible = allGroups.filter((g) => !hidden.has(g.key)).length;
    btn.textContent = t("filter") + (visible < allGroups.length ? ` (${visible}/${allGroups.length})` : "") + " ▾";
    btn.classList.toggle("rn-active", visible < allGroups.length);
    menu.replaceChildren(
      ...allGroups.map((g) => el("label", { class: "rn-filter-item" },
        el("input", { type: "checkbox", checked: !hidden.has(g.key), onchange: (e) => setHidden(org, g.key, !e.target.checked) }),
        el("span", { class: "rn-folder-icon", style: `color:${g.color}`, "aria-hidden": "true" }),
        el("span", { class: "rn-filter-name", text: g.name }),
        el("span", { class: "rn-filter-count", text: String(g.repos.length) })
      )),
      el("div", { class: "rn-filter-actions" },
        el("button", { class: "rn-btn", type: "button", text: t("showAll"), onclick: () => { ls.set("rn:hidden:" + org, []); render(); } }),
        el("button", { class: "rn-btn", type: "button", text: t("hideAll"), onclick: () => { ls.set("rn:hidden:" + org, allGroups.map((g) => g.key)); render(); } })
      )
    );
  }

  function setHidden(org, key, hide) {
    const set = new Set(ls.get("rn:hidden:" + org, []));
    if (hide) set.add(key); else set.delete(key);
    ls.set("rn:hidden:" + org, [...set]);
    render();
  }

  function setAll(open) {
    if (!current) return;
    const c = {};
    if (!open) for (const g of group(current.repos, current.repos, current.rules)) c[g.key] = true;
    ls.set("rn:collapsed:" + current.org, c);
    render();
  }

  // On/off is global (toolbar button and the in-page button share chrome.storage.local "enabled").
  let enabled = true;

  function applyEnabled(on) {
    enabled = on;
    document.documentElement.classList.toggle("rn-on", on && !!current);
    const root = current && current.root;
    if (!root) return;
    root.querySelector(".rn-toggle").textContent = on ? t("flatList") : t("folderView");
    root.classList.toggle("rn-off", !on);
  }

  function setView(org, view) {
    ls.set("rn:view:" + org, view);
    const root = current && current.root;
    if (!root) return;
    root.classList.toggle("rn-grid", view === "grid");
    for (const b of root.querySelectorAll(".rn-view")) b.setAttribute("aria-pressed", String(b.dataset.view === view));
    current.openFolder = null;
    if (current.repos.length) render();
  }

  const getSort = (org) => ls.get("rn:sort:" + org, { by: "name", dir: "asc" });

  function setSort(org, patch) {
    const sort = { ...getSort(org), ...patch };
    ls.set("rn:sort:" + org, sort);
    syncSort(org);
    render();
  }

  function syncSort(org) {
    const root = current && current.root;
    if (!root) return;
    const sort = getSort(org);
    root.querySelector(".rn-sort-by").value = sort.by;
    const dirBtn = root.querySelector(".rn-sort-dir");
    dirBtn.replaceChildren(icon(sort.dir === "desc" ? "sortDesc" : "sortAsc"));
    dirBtn.title = sort.dir === "desc" ? t("sortDesc") : t("sortAsc");
    dirBtn.setAttribute("aria-label", dirBtn.title);
  }

  function buildRoot(org) {
    return el("div", { class: "rn-root", "data-org": org },
      el("div", { class: "rn-bar" },
        el("strong", { class: "rn-title", text: t("title") }),
        el("span", { class: "rn-count", text: t("loading") }),
        el("input", { class: "rn-search", type: "search", placeholder: t("search"), oninput: () => render() }),
        el("details", { class: "rn-filter" },
          el("summary", { class: "rn-btn rn-filter-btn", text: t("filter") + " ▾" }),
          el("div", { class: "rn-filter-list" })
        ),
        el("div", { class: "rn-seg", role: "group" },
          el("button", { class: "rn-btn rn-icon-btn rn-view", type: "button", "data-view": "list", title: t("viewList"), "aria-label": t("viewList"), onclick: () => setView(org, "list") }, icon("list")),
          el("button", { class: "rn-btn rn-icon-btn rn-view", type: "button", "data-view": "grid", title: t("viewGrid"), "aria-label": t("viewGrid"), onclick: () => setView(org, "grid") }, icon("grid"))
        ),
        el("div", { class: "rn-sort", role: "group", "aria-label": t("sortBy") },
          el("select", { class: "rn-btn rn-sort-by", "aria-label": t("sortBy"), onchange: (e) => setSort(org, { by: e.target.value, dir: e.target.value === "updated" ? "desc" : "asc" }) },
            el("option", { value: "name", text: t("sortName") }),
            el("option", { value: "updated", text: t("sortUpdated") })
          ),
          el("button", { class: "rn-btn rn-icon-btn rn-sort-dir", type: "button",
            onclick: () => setSort(org, { dir: getSort(org).dir === "desc" ? "asc" : "desc" }) })
        ),
        el("div", { class: "rn-seg rn-fold" },
          iconBtn("expand", t("expandAll"), () => setAll(true)),
          iconBtn("collapse", t("collapseAll"), () => setAll(false))
        ),
        iconBtn("refresh", t("refresh"), () => refresh(true)),
        el("button", { class: "rn-btn rn-toggle", type: "button", text: t("flatList"),
          onclick: () => chrome.storage.local.set({ enabled: !enabled }) })
      ),
      el("div", { class: "rn-body" }, el("div", { class: "rn-empty", text: t("loading") }))
    );
  }

  function mount() {
    const m = location.pathname.match(ROUTE);
    if (!m) {
      document.documentElement.classList.remove("rn-on");
      current = null;
      return;
    }
    const org = decodeURIComponent(m[1]);
    const list = document.querySelector(LIST_SEL);
    if (!list) return; // React hasn't rendered yet; the observer will call again
    if (current && current.org === org && current.root.isConnected) return;

    const fresh = !current || current.org !== org;
    if (fresh) current = { org, root: buildRoot(org), repos: [], rules: [], openFolder: null };
    list.parentElement.insertBefore(current.root, list);
    applyEnabled(enabled);
    setView(org, ls.get("rn:view:" + org, "list"));
    syncSort(org);
    if (fresh) refresh(false);
    else render();
  }

  async function refresh(force) {
    if (!current) return;
    const { org, root } = current;
    try {
      current.rules = await rnLoadRules();
      const repos = await loadRepos(org, force);
      if (!current || current.org !== org) return;
      current.repos = repos;
      render();
    } catch (e) {
      root.querySelector(".rn-body").replaceChildren(
        el("div", { class: "rn-empty", text: `${t("loadFailed")} (${e.message})` }));
    }
  }

  document.addEventListener("click", (e) => {
    const d = current && current.root.querySelector(".rn-filter[open]");
    if (d && !d.contains(e.target)) d.removeAttribute("open");
  });

  // GitHub is a single-page app: watch for URL and DOM changes.
  let lastPath = location.pathname;
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        if (!ROUTE.test(lastPath)) current = null;
      }
      mount();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === "sync" && ch.rules) refresh(false);
    if (area === "local" && ch.enabled) applyEnabled(ch.enabled.newValue !== false);
  });
  chrome.storage.local.get("enabled").then(({ enabled: on }) => { enabled = on !== false; mount(); });
})();
