# Microscope Reference Diagrams

These images are visual references for building microscope views: human-facing
visibility into how a kernel run, agent process, or architecture actually moves.
They are inspiration for style, density, and process legibility. They are not
canonical architecture docs.

Use them when designing or revising:

- microscope views under `tools/microscope/`
- run trace, lineage, scoring, or selection visibility
- process diagrams that need to show causality, state, and boundary crossings
- "what happened?" artifacts meant to be understood at a glance, then drilled into

Borrow:

- explicit zones and boundaries for subsystems, contracts, and control surfaces
- dense but legible node/edge layouts that preserve causal order
- status encoding through color, badges, edge styles, and small metadata
- overview-first composition with drill-down detail available nearby
- legends that make the diagram readable without a narrator

Do not:

- copy these as the current Doppl architecture
- store generated microscope output here; generated artifacts belong in `out/**`
- force every visibility surface into this exact dark canvas style
- add visual polish that hides the process facts from `RunTrace`

Current references:

- `cody-arch-image.png` - high-density architecture map. Use for subsystem
  boundaries, lifecycle strips, data/control-flow legends, and contract keys.
- `mel-diagram-ref-1.png` - process graph canvas. Use for lineage, scoring
  nodes, generation columns, and dense edge routing.
- `mel-diagram-ref-2png.png` - wider process graph canvas. Use for multi-stage
  runs, repeated mutation/scoring loops, zoom/minimap affordances, and temporal
  spread.

If you add another image, add one line here naming what future microscope work
should borrow from it.
