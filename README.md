# Gibson Assembly Calculator

A browser-based calculator for setting up a [Gibson Assembly](https://www.neb.com/en-us/products/e2611-nebuilder-hifi-dna-assembly-master-mix) reaction. Enter the length and concentration of each DNA fragment and it returns the volume of each fragment (and water) to pipette, using NEB-recommended molar fold excesses.

**Live app:** https://mbaffour.github.io/gibson-assembly-calculator/

## Credit

This is a faithful web port of **Ben's Gibson Assembly calculator** from the
[Barrick Lab Gibson Cloning protocol](https://barricklab.org/twiki/bin/view/Lab/ProtocolsGibsonCloning)
(Barrick Lab, Michigan State University). All credit for the underlying method and
spreadsheet goes to them. The original spreadsheet — [`Bens_Gibson_Assembly.xlsx`](Bens_Gibson_Assembly.xlsx) —
is kept in this repo for provenance.

## Features

- Live recalculation as you type
- Add / remove fragment rows (first row is the vector reference)
- NEB default fold excesses (vector = 1×; inserts = 5× if ≤ 200 bp, else 2.5×), each overridable
- Optional custom default molar fold excess applied to all inserts (beyond the NEB defaults)
- Editable `v_max` (volume available for fragments)
- Master-mix multiplier: scale volumes for N reactions in the export and printable protocol
- Load the example data, copy results, export CSV, print a formatted protocol
- Save / load named presets (stored in your browser via `localStorage`)
- Runs entirely client-side — no server, no tracking

## The math

For the *n*-th fragment:

```
v_n = (f_n · l_n / c_n) · (m_1 / l_1)

m_1 = min( l_1·v_max / Σ(f_n·l_n/c_n),  φ·l_1·p_max / Σ f_n,  m_max )
```

LaTeX:

```latex
v_n = \left(\frac{f_n \cdot l_n}{c_n}\right)\left(\frac{m_1}{l_1}\right), \quad
m_1 = \mathbf{min}\left(\frac{l_1 \cdot v_{\max}}{\sum_{i=1}^n \frac{f_n l_n}{c_n}},\ \frac{\phi \cdot l_1 \cdot p_{\max}}{\sum_{i=1}^n f_n},\ m_{\max}\right)
```

Where `φ = 0.66` ng/pmol/bp, `m_max = 100` ng, and `p_max = 0.5` pmol for 2–3 fragments
or `1` pmol for 4+. `l_1` is the vector length.

## Run locally

It's a static site — just open `index.html`, or serve it:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy

Hosted on GitHub Pages from the `main` branch root. Push to `main` to update.
