# Case Study: Starship Collapses Launch Cost — Follow the Money (Evaluator)

## Summary

The consensus argues about destinations (Mars/Moon) or whether Starship is needed.
The synthesis target reframes it as a **cost-curve collapse** (Falcon 9 commercial
~$2,700–3,000/kg → Starship near-term ~$100–167/kg → target $10–100/kg) that
re-prices the entire space value chain, and then **follows the money downstream**
using the EV → lithium/copper/silver template: the non-obvious winners are the
inputs, enablers, and newly-viable payload classes, not the rocket maker alone.
This file carries the evaluator targets and the withheld synthesis; it must never
be shown during generation.

## Source

### Type

Article synthesis and market signals.

### Origin

Public reporting on Starship V3, cadence, and launch-cost economics.

### Source File

`../sources.md` (Signal Set D).

### Derived By

Doppl capstone team.

### Fidelity

Heavily synthesized. Cost-per-kg figures are third-party models and SpaceX
aspirations, not a published rate card. The thesis and predictions are analytical
bets.

### Source Notes

References:

- Exterra, "Starship V3's First Flight Rewrites the Commercial Launch Cost
  Equation" (V3 first flight May 22, 2026; ~200t reusable / ~400t expendable;
  internal $/kg projections): https://www.exterrajsc.com/p/starship-v3s-first-flight-rewrites
- New Space Economy, near-term operational cost modeling (~$100–167/kg; FAA
  cadence): https://newspaceeconomy.ca/2026/04/13/starships-commercial-moment-what-operational-starship-flights-would-do-to-launch-economics/
- TheNextWeb, Falcon 9 ~$2,700–3,000/kg; Starship target $10–100/kg; FAA 25/yr
  Starbase + 44/yr LC-39A; $15B+ spent: https://thenextweb.com/news/spacex-has-spent-more-than-15-billion-on-starship-and-is-racing-to-make-rocketry-resemble-an-airline-schedule
- TrustPost, V3 debut and Starlink V3 dependency on Starship:
  https://trustpost.org/spacex-starship-commercial-satellite-deployment-starlink-2026/

## Visibility

### Level

Public.

### Anonymized

No private individuals.

### Public Summary Allowed

Yes, with caveat (not investment advice).

### Sensitive Details

- Predictions are bets, not facts.
- Not investment guidance.

### Sharing Notes

Evaluator file. Keep targets out of any generation prompt.

## Evaluation Focus

### Stated Problem Or Symptom

"Starship is about Mars/the Moon" (or "nobody needs it; expendables suffice").

### Actual Problem

How to position for a one-to-two order-of-magnitude collapse in launch cost that
re-prices the entire space value chain — identifying the second-order beneficiaries
(inputs, enablers) and the newly-viable payload classes — rather than debating the
destination or sizing the market at today's price.

### Deleted Assumptions

- That the event is a destination, not a cost curve.
- That demand at $3,000/kg is the relevant market size (cheap launch creates new
  demand).
- That value accrues to the launch provider alone.

### Hidden Variable

The misread: a collapsed input cost flips the binding constraint from "can we
afford to launch it?" to "what would you build if launch were nearly free?", and —
as with EVs unlocking lithium/copper/silver — the money flows to the
picks-and-shovels and the newly-economic payloads, most of which are not "space
companies" today.

### Frame Recovery Target

Reframe destination → cost curve; apply the follow-the-money method to produce a
specific beneficiary map; recognize the latent-asset unlock and the
demand-creation (not just demand-capture) effect; recognize the timing is
2026-specific.

### Generated Idea Target

A `ZeitgeistSynthesisPayload` whose `details` game out a branched beneficiary map +
synthesis: thesis + audience + cited signals + why-now + >=1 dated falsifiable
prediction + comparable prior art.

### Scoring Notes

- High: reframes to the cost curve; applies the EV-commodity method to name
  *specific* enablers/inputs and newly-viable payload classes; names losers;
  falsifiable, well-timed; cites cost-collapse precedents (containerization,
  fracking) without leaning on them.
- Medium: "space economy will grow" with little specificity, or stays on the
  destination.
- Low: "Starship is about Mars," "nobody needs it," or unfalsifiable optimism.
- Subtype check (`zeitgeist_synthesis`): grounding, novelty vs consensus,
  audience/market timing (±5-year test), internal coherence, falsifiability.

## Solution

### Summary

Treat Starship as a launch-cost collapse, not a destination. When $/kg falls 1–2
orders of magnitude, the constraint flips from affordability to imagination, and
the money flows — as it did with EVs → lithium/copper/silver — to the inputs and
enablers and to payload classes that were impossible at Falcon-9 prices. Follow the
money downstream rather than buying the rocket maker alone.

### Details

`ZeitgeistSynthesisPayload`:

- **thesis:** Starship's real event is a one-to-two order-of-magnitude collapse in
  launch cost that re-prices the whole space value chain; the non-obvious winners
  are the picks-and-shovels (propellant, ground infrastructure, space-grade
  materials/components) and the newly-viable payload classes — not the launch
  provider alone — exactly as EVs unlocked lithium, copper, and silver.
- **audience:** Space-economy and commodity/industrials investors; payload
  entrepreneurs.
- **currentSignals:**
  - Starship V3 first flight May 22, 2026; ~200t reusable / ~400t expendable
    (Exterra; TrustPost).
  - Cost math: Falcon 9 commercial ~$2,700–3,000/kg today; Starship near-term
    modeled ~$100–167/kg; target $10–100/kg at high cadence (TheNextWeb; New Space
    Economy).
  - FAA cadence authorizations: 25/yr (Starbase) + 44/yr (LC-39A); SpaceX has
    captive anchor demand because Starlink V3 *requires* Starship (TheNextWeb;
    TrustPost).
- **whyNow:** V3 has flown and high-cadence authorizations are in hand, so the cost
  curve is visibly bending now. In 2020 there was no reusable super-heavy and the
  thesis was a slide; by ~2030 the curve is consensus and priced in.
- **gamedOutBeneficiaryMap (follow the money):**
  - *Method (the EV template):* when EVs went good-to-crazy, the unseen winners were
    lithium, copper, and **silver** (useful, not just a store of value — it's in the
    electronics). Trace the equivalent inputs/enablers for cheap launch.
  - *Enablers / picks-and-shovels:* methane + LOX propellant supply at scale;
    launch-site and ground infrastructure (towers, catch systems, ranges); space-
    grade materials and components (heat-shield materials, structures, avionics);
    space-traffic management and debris mitigation as cadence rises; ground stations
    and spectrum.
  - *Newly-viable payload classes (demand creation):* orbital data centers / compute
    in space (loops back to the firm-power case — power and cooling move off-grid);
    large-aperture earth observation and sensing; in-space manufacturing and
    servicing; mass-cheap constellations beyond comms.
  - *Losers:* legacy expendable launch (Ariane 6 / ULA — "sized for a market that
    moved on"); some terrestrial substitutes for sensing/comms.
  - *Edge case (flag it):* point-to-point Starship transport — credible for
    military / emergency cargo where speed dominates; passenger P2P is gated by
    takeoff/landing g-loads, so likely niche, not mass travel.
- **synthesis (what it adds up to):** Cheap launch turns space from a scarce,
  mission-by-mission frontier into *infrastructure*. As with containerization and
  fracking, the headline operator captures some value but the durable money accrues
  to the suppliers of the buildout and the builders of the newly-affordable
  payloads — most of them not "space companies" today.
- **falsifiablePredictions:**
  1. By 2030, Starship's published or credibly-estimated $/kg falls below Falcon
     9's (<$2,700/kg).
  2. By 2030, at least one payload class uneconomic at Falcon-9 pricing reaches
     orbit on Starship (e.g., an in-space manufacturing or orbital-compute demo, or
     a large-aperture sensing platform).
  3. By 2030, a measurable re-rating in a Starship picks-and-shovels input
     (a specific material/component supplier, or a propellant/ground-infrastructure
     play) is attributable to launch demand — the latent-asset unlock showing up.
  4. [Lower-confidence] By 2032, Starship is used for a non-passenger point-to-point
     case (military or emergency cargo).
- **comparablePriorArt:** Containerization — collapsing the cost of moving goods
  reorganized global trade and minted unseen winners (ports, logistics, trade
  finance) far from the box maker. Fracking — cheap US gas unlocked a petrochemical
  and manufacturing renaissance downstream. EVs → lithium/copper/silver — the input
  unlock that the headline missed. The transcontinental railroad — collapsing
  transport cost re-priced land and created towns. Used to stress-test, not as the
  argument.

### Why This Solution

It fits the recovered problem (a cost-curve collapse re-pricing the value chain)
rather than the stated symptom (destination debate), is grounded in dated signals,
falsifiable, timing-specific, and does the follow-the-money gaming the case is
built to elicit.

### Tradeoffs

- Cost-per-kg figures are models/aspirations; the curve could bend slower.
- Which specific inputs/enablers win is uncertain even if the category thesis is
  right.
- Newly-viable payload classes may take longer to materialize than the cost curve.
- The P2P-transport edge case is speculative; hold at lower confidence.

### Expected Outcome

If correct, capital positioned in the enablers and newly-viable payloads
outperforms a bet on the launch provider alone.

### Next Steps

- Track the four predictions against $/kg disclosures, payload firsts, and supplier
  re-ratings.
- Watch orbital-compute / in-space-manufacturing demos as the earliest
  demand-creation tells (and the tie-in to the firm-power thesis).

## Reproducible

### Is Reproducible

Yes, approximately.

### Reproducibility Level

Approximate.

### Steps

1. Provide the withheld case.
2. Ask for Problem Recovery, then a gamed-out zeitgeist-synthesis payload.
3. Score against the Evaluation Focus and subtype checks.

### Required Inputs

- Withheld case, evaluator version.

### Expected Result

Reframe to the cost curve + a specific beneficiary map + falsifiable, well-timed
predictions.

### Known Variability

Many defensible beneficiary maps; specificity and falsifiability separate strong
from weak.

## Validator

### Name Or Role

Space-economy / industrials analyst or payload entrepreneur.

### Relationship To Case

Can judge grounding, the beneficiary map, and falsifiability.

### Can Validate

- Cost-curve framing and demand-creation logic.
- Plausibility of the beneficiary map.
- Falsifiability of predictions.

### Validation Method

Rubric review.

## Open Questions

- How fast does reuse drive cost to modeled levels?
- Which payload classes materialize first, and how big?

## Notes

Treat as a public synthesis case with a fidelity caveat on the cost figures.
Companion *latent-asset unlock* to `ai-firm-power-constraint` (orbital compute is
the literal bridge). Score the cost-curve reframe and the specificity +
falsifiability of the follow-the-money beneficiary map.
