# S0 · Runs Home

The control-room index and entry point. Lists every run (live + completed + failed), pins the live one, and routes to **Open live → S2**, **Replay → S6**, **Final idea → S5**, or **New Run → S1**.

- `index.html` — fixture-driven runs list (the 3 canonical runs from `10-dummy-data-fixtures.md`: `run_7f3a` live, `run_5c1e` completed, `run_2a90` failed), with status filter chips, a New Run CTA, and the dark/light toggle.
- Composes `StatusBadge` (run status), `Meter` (energy), `Button` from the design-system bundle.
- The `New Run` CTA is operator-only — hide it in reviewer mode.

Open `index.html` directly in a browser (it loads `../../styles.css` + `../../_ds_bundle.js`). "Open live →" links to the Organism View kit.
