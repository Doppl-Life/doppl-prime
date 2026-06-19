# Subtype Index

Per `ALIGNMENT.md` (Decision 2), every case study is tagged with the Doppl `CandidateIdea` subtype its `solution_generation` output represents: `cross_domain_transfer` or `zeitgeist_synthesis` (`ARCHITECTURE.md` §3, Appendix A). `problem_recovery` is a shared upstream stage and is **not** a subtype.

## Assignments

| Case | Subtype | Rationale |
| --- | --- | --- |
| `airport-liquid-congestion` | `cross_domain_transfer` | Maps choice-architecture / upstream-nudge (behavioral econ) onto airport screening throughput. |
| `ae-waiting-room-aggression` | `cross_domain_transfer` | Maps operational-transparency / progress-visibility (service design) onto ED aggression. |
| `heinz-ketchup-authenticity` | `cross_domain_transfer` | Maps a visible self-authentication packaging cue onto counterfeit/substitution detection. |
| `houston-baggage-walk` | `cross_domain_transfer` | Maps occupied-vs-idle time perception (queue psychology) onto baggage-wait complaints. |
| `loft-insulation-adoption` | `cross_domain_transfer` | Maps last-mile friction removal (behavioral ops) onto energy-upgrade adoption. |
| `london-underground-map-distortion` | `cross_domain_transfer` | Maps information-architecture / representation manipulation onto transit load balancing. |
| `singapore-mrt-pre-peak` | `cross_domain_transfer` | Maps demand-shaping price incentives (economics) onto peak transit congestion. |
| `vanmoof-bike-packaging` | `cross_domain_transfer` | Maps handler-behavior signaling onto shipping-damage reduction (the case text itself notes the shared structure with the drone case). |
| `white-castle-rent-leverage` | `cross_domain_transfer` | Maps "change what is fixed" (portable/standardized asset) onto landlord-leverage risk. |
| `jack-drone-privacy` | `cross_domain_transfer` | Maps objective-denial + behavioral cue onto paparazzi-drone privacy. |
| `jack-yacht-perimeter-intrusion` | `cross_domain_transfer` | Maps defense/maritime sensor fusion onto yacht waterline perimeter security. |
| `jack-yacht-connectivity-continuity` | `cross_domain_transfer` (open) | Maps perception-layer continuity (buffering/prediction/edge caching from media streaming) onto yacht connectivity. Intentionally open/unsolved. |

## Alignment finding — zeitgeist_synthesis is not covered

All twelve imported cases are `cross_domain_transfer`. The architecture treats both subtypes as **equal must-ship** (`ARCHITECTURE.md` §7, Q2) and the Subtype Check Lab (PRD 11) needs typed evidence for **both**. This corpus does not provide a `zeitgeist_synthesis` fixture (a thesis/framing fitted to current signals, with `currentSignals`, `whyNow`, `falsifiablePredictions`, `comparablePriorArt`).

Action for the team (not resolved by this alignment pass): author at least one `zeitgeist_synthesis` case so the demo and the subtype checks exercise both lifecycles. The `jack-yacht-connectivity-continuity` case has the strongest current-signal flavor (Starlink disruption) and could seed such a variant, but as written its task is transfer-style problem recovery.
