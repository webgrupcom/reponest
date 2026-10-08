const t = (key) => chrome.i18n.getMessage(key) || key;
const rowsEl = document.getElementById("rows");
const msg = document.getElementById("msg");

for (const n of document.querySelectorAll("[data-i18n]")) n.textContent = t(n.dataset.i18n);

const split = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

function row(r = { name: "", color: "#768390", prefixes: [], topics: [] }) {
  const tr = document.createElement("tr");
  const input = (val, cls) => {
    const i = document.createElement("input");
    i.type = "text"; i.value = val; i.className = cls;
    return i;
  };
  const color = document.createElement("input");
  color.type = "color"; color.value = r.color || "#768390"; color.className = "color";
  const cells = [color, input(r.name, "name"), input((r.prefixes || []).join(", "), "prefixes"), input((r.topics || []).join(", "), "topics")];
  cells.forEach((c, i) => {
    const td = document.createElement("td");
    if (i === 3) td.className = "hide-sm";
    td.append(c);
    tr.append(td);
  });
  const act = document.createElement("td");
  act.className = "row-actions";
  const actions = [
    ["↑", () => tr.previousElementSibling && tr.parentNode.insertBefore(tr, tr.previousElementSibling)],
    ["↓", () => tr.nextElementSibling && tr.parentNode.insertBefore(tr.nextElementSibling, tr)],
    [t("optDelete"), () => tr.remove()]
  ];
  for (const [label, fn] of actions) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.addEventListener("click", fn);
    act.append(b, " ");
  }
  tr.append(act);
  return tr;
}

function fill(rules) {
  rowsEl.textContent = "";
  rules.forEach((r) => rowsEl.append(row(r)));
}

function read() {
  return [...rowsEl.querySelectorAll("tr")].map((tr) => ({
    name: tr.querySelector(".name").value.trim(),
    color: tr.querySelector(".color").value,
    prefixes: split(tr.querySelector(".prefixes").value),
    topics: split(tr.querySelector(".topics").value)
  })).filter((r) => r.name);
}

function flash(text) {
  msg.textContent = text;
  setTimeout(() => { msg.textContent = ""; }, 3000);
}

document.getElementById("add").addEventListener("click", () => rowsEl.append(row()));
document.getElementById("preset").addEventListener("click", () => fill(RN_EXAMPLE_RULES));
document.getElementById("auto").addEventListener("click", async () => {
  await chrome.storage.sync.set({ rules: [] });
  fill([]);
  flash(t("optAutoSaved"));
});
document.getElementById("save").addEventListener("click", async () => {
  const rules = read();
  await chrome.storage.sync.set({ rules });
  flash(rules.length ? t("optSaved") : t("optAutoSaved"));
});

rnLoadRules().then(fill);
