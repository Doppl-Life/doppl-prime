# PRD 00: Prototype PRD Index

## Purpose

This folder defines Doppl through prototype PRDs: small, testable proof surfaces that each make one part of the full agent-evolution organism obvious. The current live prototype suite proves five surfaces already: energy metabolism, critic council, fusion lab, run trace viewer, and spend/yield ledger. The remaining PRDs describe the next prototype surfaces needed to prove the whole Doppl loop.

The architecture remains binding. These PRDs do not replace `ARCHITECTURE.md`; they translate it into visible product proof moments.

## Spec Anchors

- `ARCHITECTURE.md §1-3` system goal, ownership surfaces, lifecycle
- `ARCHITECTURE.md §4` event source of truth
- `ARCHITECTURE.md §5-8` kernel, gateway, verifier, scoring, reproduction
- `ARCHITECTURE.md §9-13` projections, API, dashboard, observability
- `ARCHITECTURE.md §16-17` demo path and fallback
- `IMPLEMENTATION_PLAN.md` phase acceptance criteria
- Live prototype suite: `https://doppl-life.github.io/mh-doppl-spike/prototypes/react-flow-demo/dist/`

## Prototype PRD Set

| PRD | Proof Surface | Status |
|---|---|---|
| `01-energy-metabolism-prototype-prd.md` | Bounded energy, culling, and reproductive pressure | Existing prototype |
| `02-critic-council-prototype-prd.md` | Evidence discipline and held-out judging | Existing prototype |
| `03-fusion-lab-prototype-prd.md` | Parent choice, weighted inheritance, child comparison | Existing prototype |
| `04-run-trace-viewer-prototype-prd.md` | Meta to individual to atom replay/explainability | Existing prototype |
| `05-spend-yield-ledger-prototype-prd.md` | Spend, output yield, and allocation signals | Existing prototype |
| `06-case-study-intake-prototype-prd.md` | Withheld-solution problem harness | New prototype needed |
| `07-agenome-pool-prototype-prd.md` | Mutagen library, traits, and run composition | New prototype needed |
| `08-model-gateway-prototype-prd.md` | Structured output validation, repair, reject, fallback | New prototype needed |
| `09-event-store-replay-prototype-prd.md` | Append-only truth and deterministic replay | New prototype needed |
| `10-live-run-operator-console-prototype-prd.md` | Start, monitor, stop, and recover a run | New prototype needed |
| `11-subtype-check-lab-prototype-prd.md` | Cross-domain and zeitgeist subtype checks | New prototype needed |
| `12-novelty-prior-art-radar-prototype-prd.md` | Novelty, prior art, and current-signal pressure | New prototype needed |
| `13-final-survivor-proof-panel-prototype-prd.md` | Closing proof that the survivor won for defensible reasons | New prototype needed |
| `14-demo-fallback-ladder-prototype-prd.md` | Local-first demo reliability under provider failure | New prototype needed |

## Shared PRD Template

Every prototype PRD answers:

- **Prototype question:** what are we trying to prove?
- **Audience moment:** what should be obvious in 10 seconds?
- **User workflow:** what can the operator/user do?
- **Required data/events:** what real contracts/events power it?
- **Acceptable fixture:** what can be fake for now?
- **Convincing demo bar:** what makes it feel real?
- **Falsification bar:** what would prove this prototype is not working?
- **Graduation path:** how it becomes production Doppl.

## Non-Negotiable Invariants

- `run_events` is authoritative.
- Replay uses stored events only.
- Per-run `sequence` is the ordering key.
- Candidate text is data, not instructions.
- Critics produce evidence; selection chooses winners.
- Held-out judge rubric is immutable to agents.
- Caps are enforced in code.
- Demo and hosted surfaces introduce no new event truth.

