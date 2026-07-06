# Improvements

A summary of the fixes and additive features in this change set. The core
calculation formula (`computeFragments`) is unchanged — new inputs only feed the
existing math or scale/format its results for output.

## Fixes

- **Added an MIT `LICENSE`.** The README described the project as "open source"
  but the repo had no license file. Added a standard MIT license
  (`Copyright (c) 2026 Michael Baffour Awuah`).
- **Accessibility: results are now announced to screen readers.** The computed
  output cells (per-fragment volume/mass/amount and the water/total rows) live in
  the results table but were not exposed as a live region, so screen-reader users
  got no feedback when values updated. Added `aria-live="polite"` to the results
  `<tbody id="frag-body">` and `role="status" aria-live="polite"` to the results
  `<tfoot>` (`index.html`). No calculation logic was touched.

## New features

All three are additive and default to the previous behaviour when left untouched.

- **Custom default molar fold excess** (`index.html` param `#default-fold`,
  `app.js` `defaultFold()`). A single optional input applies a custom molar ratio
  to every insert that has no explicit per-row fold override. Blank keeps the NEB
  defaults (5× for ≤ 200 bp, else 2.5×); the vector stays fixed at 1×. This only
  changes which value substitutes for a blank fold before the existing formula
  runs — the formula itself is unchanged.
- **Master-mix multiplier for N reactions** (`index.html` param `#n-reactions`
  and the `#mastermix` panel, `app.js` `nReactions()` / `renderMasterMix()`).
  Enter a reaction count N; a scaled per-component volume table appears (shown only
  when N > 1 and the reaction is solvable), and the CSV/copy export gains a
  `volume xN(uL)` column. Purely a multiplication of the per-reaction result by N
  for display/export — no effect on the single-reaction calculation.
- **Printable protocol** (`index.html` button `#btn-print`, `app.js` print
  handler). Opens a clean, self-contained page with the reaction parameters and a
  volumes table (including the ×N master-mix column when applicable) and triggers
  the browser's print / "Save as PDF" dialog. Falls back to a toast if pop-ups are
  blocked or the reaction is not yet solvable.

### Notes / not changed

- Presets (`localStorage`) transparently carry the two new parameters. Older saved
  presets that predate them still load — `syncParamInputs()` tolerates missing
  keys (`defaultFold` → blank, `nReactions` → 1).
- No new dependencies; the app remains a static, client-side site.
