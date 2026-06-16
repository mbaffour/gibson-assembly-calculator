/* Gibson Assembly Calculator
 * Reproduces the math from "Bens Gibson Assembly.xlsx".
 * Row 0 = vector (reference, fold-excess defaults to 1); rows 1+ = inserts.
 */
"use strict";

const PHI = 0.66;     // ng / pmol / bp
const M_MAX = 100;    // ng

/* ---------- Calculation engine (pure) ---------- */

// Default molar fold excess when the user leaves it blank.
function defaultFold(frag, isVector) {
  if (isVector) return 1;
  return frag.length <= 200 ? 5 : 2.5;
}

// Is a fragment "active" — both length and conc entered & positive?
function isActive(f) {
  return f.length > 0 && f.conc > 0;
}

/**
 * @param {Array<{label,length,conc,fold}>} frags  fold may be null/'' for default
 * @param {number} vMax  volume available for fragments (µL)
 * @returns {{rows, m1, pMax, numFrags, totalVol, water, totalAmt}}
 */
function computeFragments(frags, vMax) {
  const numFrags = frags.filter((f) => f.length > 0).length;
  const pMax = numFrags < 4 ? 0.5 : 1;

  const vector = frags[0];
  const l1 = vector ? vector.length : 0;

  // Resolve fold excess for every fragment.
  const folds = frags.map((f, i) =>
    f.fold != null && f.fold !== "" && !Number.isNaN(f.fold)
      ? Number(f.fold)
      : defaultFold(f, i === 0)
  );

  // O_n = f_n * l_n / c_n, summed over active fragments.
  const O = frags.map((f, i) => (isActive(f) ? (folds[i] * f.length) / f.conc : 0));
  const sumO = O.reduce((a, b) => a + b, 0);
  const sumFold = frags.reduce((a, f, i) => (isActive(f) ? a + folds[i] : a), 0);

  // m_1 only defined when vector is active and denominators are valid.
  let m1 = null;
  if (isActive(vector) && sumO > 0 && sumFold > 0) {
    m1 = Math.min(
      (l1 * vMax) / sumO,
      (PHI * l1 * pMax) / sumFold,
      M_MAX
    );
  }

  const rows = frags.map((f, i) => {
    const active = isActive(f) && m1 != null && l1 > 0;
    const vol = active ? (O[i] * m1) / l1 : null;
    const mass = active ? f.conc * vol : null;
    const amt = active ? (folds[i] / PHI) * (m1 / l1) : null; // pmol
    return {
      foldUsed: isActive(f) ? folds[i] : null,
      vol,
      mass,
      amt,
    };
  });

  const totalVol = rows.reduce((a, r) => a + (r.vol || 0), 0);
  const totalAmt = rows.reduce((a, r) => a + (r.amt || 0), 0);
  const water = m1 != null ? vMax - totalVol : null;

  return { rows, m1, pMax, numFrags, totalVol, water, totalAmt };
}

/* ---------- State ---------- */

const EXAMPLE = {
  vMax: 5,
  frags: [
    { label: "vector", length: 7000, conc: 30, fold: "" },
    { label: "insert 1", length: 2000, conc: 9, fold: 3 },
    { label: "insert 2", length: 900, conc: 15, fold: 3 },
  ],
};

const BLANK = {
  vMax: 5,
  frags: [
    { label: "vector", length: "", conc: "", fold: "" },
    { label: "insert 1", length: "", conc: "", fold: "" },
  ],
};

let state = structuredClone(BLANK);

const PRESET_KEY = "gibson-assembly-presets";

/* ---------- DOM helpers ---------- */

const $ = (id) => document.getElementById(id);
const body = $("frag-body");

function num(v) {
  return v === "" || v == null ? "" : Number(v);
}

function fmt(v, digits = 2) {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/* ---------- Rendering ---------- */

function renderRows() {
  body.innerHTML = "";
  state.frags.forEach((f, i) => {
    const isVector = i === 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="role-tag ${isVector ? "role-vector" : ""}">${isVector ? "vector" : "insert"}</td>
      <td><input class="cell label-cell" type="text" data-i="${i}" data-k="label" value="${escapeHtml(f.label)}" placeholder="frag ${i + 1}" /></td>
      <td><input class="cell in-cell" type="number" min="0" step="any" data-i="${i}" data-k="length" value="${f.length}" /></td>
      <td><input class="cell in-cell" type="number" min="0" step="any" data-i="${i}" data-k="conc" value="${f.conc}" /></td>
      <td><input class="cell in-cell" type="number" min="0" step="any" data-i="${i}" data-k="fold" value="${f.fold}" placeholder="${isVector ? "1" : "auto"}" /></td>
      <td class="num out-cell" data-out="vol">—</td>
      <td class="num out-cell" data-out="mass">—</td>
      <td class="num out-cell" data-out="amt">—</td>
      <td class="fold-cell" data-out="fold">—</td>
      <td class="col-act"><button class="btn-del" title="Remove fragment" data-del="${i}" ${isVector ? "disabled" : ""}>✕</button></td>
    `;
    body.appendChild(tr);
  });
  recalc();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

let lastResult = null;

function recalc() {
  const frags = state.frags.map((f) => ({
    label: f.label,
    length: num(f.length) || 0,
    conc: num(f.conc) || 0,
    fold: f.fold,
  }));
  const vMax = Number(state.vMax) || 0;
  const res = computeFragments(frags, vMax);
  lastResult = res;

  const rows = body.querySelectorAll("tr");
  rows.forEach((tr, i) => {
    const r = res.rows[i];
    tr.querySelector('[data-out="vol"]').textContent = fmt(r.vol, 2);
    tr.querySelector('[data-out="mass"]').textContent = fmt(r.mass, 1);
    tr.querySelector('[data-out="amt"]').textContent = fmt(r.amt, 3);
    tr.querySelector('[data-out="fold"]').textContent =
      r.foldUsed == null ? "—" : fmt(r.foldUsed, r.foldUsed % 1 ? 1 : 0);
  });

  $("out-water").textContent = fmt(res.water, 2);
  $("out-total-vol").textContent = fmt(res.m1 != null ? res.totalVol : null, 2);
  $("out-total-amt").textContent = fmt(res.m1 != null ? res.totalAmt : null, 3);
  $("ro-pmax").textContent = `${res.pMax} pmol`;
  $("ro-m1").textContent = res.m1 == null ? "—" : `${fmt(res.m1, 2)} ng`;
}

/* ---------- Events ---------- */

body.addEventListener("input", (e) => {
  const el = e.target;
  if (!el.dataset.k) return;
  const i = +el.dataset.i;
  state.frags[i][el.dataset.k] = el.value;
  recalc();
});

body.addEventListener("click", (e) => {
  const del = e.target.closest("[data-del]");
  if (!del) return;
  const i = +del.dataset.del;
  if (i === 0) return; // vector protected
  state.frags.splice(i, 1);
  renderRows();
});

$("btn-add").addEventListener("click", () => {
  state.frags.push({ label: `insert ${state.frags.length}`, length: "", conc: "", fold: "" });
  renderRows();
});

$("v-max").addEventListener("input", (e) => {
  state.vMax = e.target.value;
  recalc();
});

$("btn-example").addEventListener("click", () => {
  state = structuredClone(EXAMPLE);
  $("v-max").value = state.vMax;
  renderRows();
  toast("Example loaded");
});

$("btn-reset").addEventListener("click", () => {
  state = structuredClone(BLANK);
  $("v-max").value = state.vMax;
  renderRows();
  toast("Reset");
});

/* ---------- Export / copy ---------- */

function resultTable() {
  const header = ["role", "label", "length(bp)", "conc(ng/uL)", "fold", "volume(uL)", "mass(ng)", "amount(pmol)"];
  const lines = state.frags.map((f, i) => {
    const r = lastResult.rows[i];
    return [
      i === 0 ? "vector" : "insert",
      f.label || `frag ${i + 1}`,
      f.length, f.conc,
      r.foldUsed ?? "",
      r.vol != null ? r.vol.toFixed(2) : "",
      r.mass != null ? r.mass.toFixed(1) : "",
      r.amt != null ? r.amt.toFixed(3) : "",
    ];
  });
  lines.push(["", "Water (H2O)", "", "", "", lastResult.water != null ? lastResult.water.toFixed(2) : "", "", ""]);
  return { header, lines };
}

$("btn-csv").addEventListener("click", () => {
  const { header, lines } = resultTable();
  const csv = [header, ...lines]
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "gibson-assembly.csv";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("CSV exported");
});

$("btn-copy").addEventListener("click", async () => {
  const { header, lines } = resultTable();
  const text = [header, ...lines].map((r) => r.join("\t")).join("\n");
  try {
    await navigator.clipboard.writeText(text);
    toast("Results copied");
  } catch {
    toast("Copy failed — select manually");
  }
});

/* ---------- Presets (localStorage) ---------- */

function loadPresets() {
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY)) || {};
  } catch {
    return {};
  }
}

function savePresets(p) {
  localStorage.setItem(PRESET_KEY, JSON.stringify(p));
}

function refreshPresetSelect() {
  const sel = $("preset-select");
  const presets = loadPresets();
  const names = Object.keys(presets);
  sel.innerHTML = names.length
    ? names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("")
    : `<option value="">(no saved presets)</option>`;
}

$("btn-save").addEventListener("click", () => {
  const name = $("preset-name").value.trim();
  if (!name) return toast("Enter a preset name first");
  const presets = loadPresets();
  presets[name] = structuredClone(state);
  savePresets(presets);
  refreshPresetSelect();
  $("preset-select").value = name;
  toast(`Saved “${name}”`);
});

$("btn-load").addEventListener("click", () => {
  const name = $("preset-select").value;
  const presets = loadPresets();
  if (!name || !presets[name]) return toast("No preset selected");
  state = structuredClone(presets[name]);
  $("v-max").value = state.vMax;
  renderRows();
  toast(`Loaded “${name}”`);
});

$("btn-del").addEventListener("click", () => {
  const name = $("preset-select").value;
  const presets = loadPresets();
  if (!name || !presets[name]) return;
  delete presets[name];
  savePresets(presets);
  refreshPresetSelect();
  toast(`Deleted “${name}”`);
});

/* ---------- Toast ---------- */

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

/* ---------- Init ---------- */

renderRows();
refreshPresetSelect();
