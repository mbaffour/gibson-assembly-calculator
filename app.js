/* Gibson Assembly Calculator
 * Reproduces the math from "Bens Gibson Assembly.xlsx".
 * Row 0 = vector (reference, fold-excess defaults to 1); rows 1+ = inserts.
 */
"use strict";

const PHI = 0.66;     // ng / pmol / bp
const M_MAX = 100;    // ng

/* ---------- Calculation engine (pure) ---------- */

// Default molar fold excess when the user leaves it blank.
// A positive `customFold` overrides the NEB defaults for inserts (the vector
// stays at 1×). Blank / non-positive falls back to the NEB rule.
function defaultFold(frag, isVector, customFold) {
  if (isVector) return 1;
  if (customFold != null && customFold !== "" && Number(customFold) > 0) {
    return Number(customFold);
  }
  return frag.length <= 200 ? 5 : 2.5;
}

// Is a fragment "active" — both length and conc entered & positive?
function isActive(f) {
  return f.length > 0 && f.conc > 0;
}

/**
 * @param {Array<{label,length,conc,fold}>} frags  fold may be null/'' for default
 * @param {number} vMax  volume available for fragments (µL)
 * @param {number|string} [customFold]  optional custom default fold for inserts
 * @returns {{rows, m1, pMax, numFrags, totalVol, water, totalAmt}}
 */
function computeFragments(frags, vMax, customFold) {
  const numFrags = frags.filter((f) => f.length > 0).length;
  const pMax = numFrags < 4 ? 0.5 : 1;

  const vector = frags[0];
  const l1 = vector ? vector.length : 0;

  // Resolve fold excess for every fragment.
  const folds = frags.map((f, i) =>
    f.fold != null && f.fold !== "" && !Number.isNaN(f.fold)
      ? Number(f.fold)
      : defaultFold(f, i === 0, customFold)
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
  defaultFold: "",
  nReactions: 1,
  frags: [
    { label: "vector", length: 7000, conc: 30, fold: "" },
    { label: "insert 1", length: 2000, conc: 9, fold: 3 },
    { label: "insert 2", length: 900, conc: 15, fold: 3 },
  ],
};

const BLANK = {
  vMax: 5,
  defaultFold: "",
  nReactions: 1,
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
      <td class="col-role"><span class="role-tag ${isVector ? "role-vector" : ""}">${isVector ? "vector" : "insert"}</span></td>
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
  const res = computeFragments(frags, vMax, state.defaultFold);
  lastResult = res;

  // Update a cell's text and give it a celebratory "bump" when it goes
  // from blank ("—") to a real value (i.e. the reaction just became solvable).
  const setOut = (el, text) => {
    if (!el) return;
    const wasBlank = el.textContent === "—";
    el.textContent = text;
    if (wasBlank && text !== "—" && el.classList.contains("out-cell")) {
      el.classList.remove("bump");
      void el.offsetWidth; // restart animation
      el.classList.add("bump");
    }
  };

  const rows = body.querySelectorAll("tr");
  rows.forEach((tr, i) => {
    const r = res.rows[i];
    setOut(tr.querySelector('[data-out="vol"]'), fmt(r.vol, 2));
    setOut(tr.querySelector('[data-out="mass"]'), fmt(r.mass, 1));
    setOut(tr.querySelector('[data-out="amt"]'), fmt(r.amt, 3));
    tr.querySelector('[data-out="fold"]').textContent =
      r.foldUsed == null ? "—" : fmt(r.foldUsed, r.foldUsed % 1 ? 1 : 0);
  });

  setOut($("out-water"), fmt(res.water, 2));
  setOut($("out-total-vol"), fmt(res.m1 != null ? res.totalVol : null, 2));
  setOut($("out-total-amt"), fmt(res.m1 != null ? res.totalAmt : null, 3));
  $("ro-pmax").textContent = `${res.pMax} pmol`;
  $("ro-m1").textContent = res.m1 == null ? "—" : `${fmt(res.m1, 2)} ng`;

  renderMasterMix(res);
}

// Master-mix multiplier: scale each fragment + water volume by N reactions.
// Purely a display of the per-reaction result × N — the core formula is untouched.
function nReactions() {
  const n = Math.floor(Number(state.nReactions));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function renderMasterMix(res) {
  const panel = $("mastermix");
  const n = nReactions();
  const solvable = res.m1 != null;

  // Only surface the panel when it adds information (N > 1 and a solvable rxn).
  if (n <= 1 || !solvable) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  $("mm-n").textContent = n;
  $("mm-n2").textContent = n;

  const mmBody = $("mm-body");
  mmBody.innerHTML = "";
  state.frags.forEach((f, i) => {
    const r = res.rows[i];
    if (r.vol == null) return;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(f.label || `frag ${i + 1}`)}</td>
      <td class="num out-cell">${fmt(r.vol * n, 2)}</td>`;
    mmBody.appendChild(tr);
  });
  const waterTr = document.createElement("tr");
  waterTr.innerHTML = `
    <td>Water (H₂O)</td>
    <td class="num out-cell">${fmt((res.water ?? 0) * n, 2)}</td>`;
  mmBody.appendChild(waterTr);

  $("mm-total").textContent = fmt(res.totalVol * n + (res.water ?? 0) * n, 2);
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

$("default-fold").addEventListener("input", (e) => {
  state.defaultFold = e.target.value;
  recalc();
});

$("n-reactions").addEventListener("input", (e) => {
  state.nReactions = e.target.value;
  recalc();
});

// Reflect the current state's reaction parameters into their input controls.
// Tolerates older presets that predate the newer params.
function syncParamInputs() {
  $("v-max").value = state.vMax;
  $("default-fold").value = state.defaultFold ?? "";
  $("n-reactions").value = state.nReactions ?? 1;
}

$("btn-example").addEventListener("click", () => {
  state = structuredClone(EXAMPLE);
  syncParamInputs();
  renderRows();
  toast("✨ Example loaded — happy cloning!");
});

$("btn-reset").addEventListener("click", () => {
  state = structuredClone(BLANK);
  syncParamInputs();
  renderRows();
  toast("🧼 Clean slate!");
});

/* ---------- Export / copy ---------- */

function resultTable() {
  const n = nReactions();
  const scaled = n > 1; // append a master-mix column only when it adds info
  const header = ["role", "label", "length(bp)", "conc(ng/uL)", "fold", "volume(uL)", "mass(ng)", "amount(pmol)"];
  if (scaled) header.push(`volume x${n}(uL)`);

  const lines = state.frags.map((f, i) => {
    const r = lastResult.rows[i];
    const row = [
      i === 0 ? "vector" : "insert",
      f.label || `frag ${i + 1}`,
      f.length, f.conc,
      r.foldUsed ?? "",
      r.vol != null ? r.vol.toFixed(2) : "",
      r.mass != null ? r.mass.toFixed(1) : "",
      r.amt != null ? r.amt.toFixed(3) : "",
    ];
    if (scaled) row.push(r.vol != null ? (r.vol * n).toFixed(2) : "");
    return row;
  });

  const water = lastResult.water;
  const waterRow = ["", "Water (H2O)", "", "", "", water != null ? water.toFixed(2) : "", "", ""];
  if (scaled) waterRow.push(water != null ? (water * n).toFixed(2) : "");
  lines.push(waterRow);
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
  toast("💾 CSV exported!");
});

// Printable protocol: opens a clean, self-contained page ready for the browser's
// print / "Save as PDF" dialog. Uses the same computed results as the on-page table.
$("btn-print").addEventListener("click", () => {
  if (lastResult == null || lastResult.m1 == null) {
    return toast("Enter fragment lengths & concentrations first");
  }
  const n = nReactions();
  const scaled = n > 1;
  const res = lastResult;

  const rowsHtml = state.frags
    .map((f, i) => {
      const r = res.rows[i];
      if (r.vol == null) return "";
      const scaledCell = scaled ? `<td class="num">${fmt(r.vol * n, 2)}</td>` : "";
      return `<tr>
        <td>${escapeHtml(f.label || `frag ${i + 1}`)}</td>
        <td>${i === 0 ? "vector" : "insert"}</td>
        <td class="num">${escapeHtml(f.length)}</td>
        <td class="num">${escapeHtml(f.conc)}</td>
        <td class="num">${r.foldUsed == null ? "—" : fmt(r.foldUsed, r.foldUsed % 1 ? 1 : 0)}</td>
        <td class="num">${fmt(r.vol, 2)}</td>
        ${scaledCell}
      </tr>`;
    })
    .join("");

  const waterScaled = scaled ? `<td class="num">${fmt((res.water ?? 0) * n, 2)}</td>` : "";
  const scaledHead = scaled ? `<th class="num">Vol ×${n} (µL)</th>` : "";
  const title = "Gibson Assembly protocol";

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
<title>${title}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #221d3a; margin: 32px; }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  .meta { color: #6a6386; font-size: 0.9rem; margin: 0 0 18px; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0 20px; }
  th, td { border: 1px solid #d8d3ec; padding: 6px 10px; text-align: left; font-size: 0.9rem; }
  th { background: #f3effe; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; font-size: 0.9rem; max-width: 420px; }
  dt { color: #6a6386; } dd { margin: 0; font-weight: 600; }
  @media print { body { margin: 0; } }
</style></head>
<body>
  <h1>🧬 ${title}</h1>
  <p class="meta">Generated ${new Date().toLocaleString()}${scaled ? ` · master mix for ${n} reactions` : ""}</p>
  <dl>
    <dt>v<sub>max</sub></dt><dd>${escapeHtml(state.vMax)} µL</dd>
    <dt>p<sub>max</sub></dt><dd>${res.pMax} pmol</dd>
    <dt>Vector mass m<sub>1</sub></dt><dd>${fmt(res.m1, 2)} ng</dd>
    <dt>Default insert fold</dt><dd>${state.defaultFold ? escapeHtml(state.defaultFold) + "×" : "NEB auto"}</dd>
    <dt>Reactions (N)</dt><dd>${n}</dd>
  </dl>
  <table>
    <thead><tr>
      <th>Label</th><th>Role</th><th class="num">Length (bp)</th><th class="num">Conc (ng/µL)</th>
      <th class="num">Fold</th><th class="num">Vol (µL)</th>${scaledHead}
    </tr></thead>
    <tbody>
      ${rowsHtml}
      <tr><td>Water (H₂O)</td><td></td><td></td><td></td><td></td><td class="num">${fmt(res.water, 2)}</td>${waterScaled}</tr>
      <tr><th>Total</th><td></td><td></td><td></td><td></td><th class="num">${fmt(res.totalVol + (res.water ?? 0), 2)}</th>${scaled ? `<th class="num">${fmt((res.totalVol + (res.water ?? 0)) * n, 2)}</th>` : ""}</tr>
    </tbody>
  </table>
  <p class="meta">Web port of Ben's Gibson Assembly calculator (Barrick Lab). Combine fragments + water, then add master mix per your kit's protocol.</p>
  <script>window.onload = function () { window.print(); };<\/script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return toast("😬 Pop-up blocked — allow pop-ups to print");
  w.document.open();
  w.document.write(html);
  w.document.close();
  toast("🖨️ Protocol ready to print");
});

$("btn-copy").addEventListener("click", async () => {
  const { header, lines } = resultTable();
  const text = [header, ...lines].map((r) => r.join("\t")).join("\n");
  try {
    await navigator.clipboard.writeText(text);
    toast("📋 Copied to clipboard!");
  } catch {
    toast("😬 Copy failed — select manually");
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
  syncParamInputs();
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
