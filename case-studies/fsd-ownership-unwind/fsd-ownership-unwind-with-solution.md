# Case Study: The Ownership Unwind / Car-as-a-Service After Autonomy (Evaluator)

## Summary

The private car is an *owned asset* around which a $1.69T auto-credit complex, a
legally fortified 16,972-dealer franchise system, a residual-value market, the
automaker unit-sales model, fuel retail, and a vast parking footprint are built.
Autonomy makes a self-driven, idle (~95%), depreciating private asset irrational for
many households, shifting mobility from ownership to service. The synthesis target
maps the value chain (breadth), games out the depth (dealer/franchise-law fight,
residual collapse breaking leasing/ABS, the OEM unit→miles flip, fuel/parking
unwind), and the decisive ownership fork (pure service vs. Tesla's owned-fleet
hybrid). This file carries the evaluator targets; never show it during generation.

## Source

### Type

Article synthesis and market signals.

### Origin

Public reporting on auto finance, the dealer franchise system, residual values, and
vehicle utilization.

### Source File

`../sources.md` (Signal Set D10).

### Derived By

Doppl capstone team.

### Fidelity

Heavily synthesized. The auto-loan/dealer/employment figures are real/cited; the
~95%-idle figure is a commonly-modeled estimate (lower fidelity); the thesis and
predictions are bets.

### Source Notes

References:

- Auto-loan balance — Federal Reserve Bank of New York, Household Debt & Credit
  (auto loans $1.69T, 2026Q1):
  https://www.newyorkfed.org/medialibrary/interactives/householdcredit/data/pdf/hhdc_2026q1.pdf
- Dealers/franchise system — NADA, 2025 financial profile (16,972 franchised
  light-vehicle dealers; $645B sales; 1.13M employed; 137M repair orders / $81B
  service & parts): https://www.nada.org/media/4694/download?inline=
- Direct-sales vs. franchise law — Tesla's state-by-state direct-sales fights are the
  live leading indicator (state franchise laws bar OEM direct/fleet sales in many
  states).
- Idle-vehicle estimate — privately owned vehicles are parked ~95% of the time
  (commonly-modeled figure; e.g. Morgan Stanley / RethinkX). Treat as estimate.
- Autonomy deployment/legality + own-the-stack: see `../sources.md` Signal Sets D4.

## Visibility

### Level

Public.

### Anonymized

No private individuals; company names are public.

### Public Summary Allowed

Yes, with caveat (not investment advice).

### Sensitive Details

- Predictions are bets, not facts.
- The ~95%-idle figure is an estimate, not an audited statistic.

### Sharing Notes

Evaluator file. Keep targets out of any generation prompt.

## Evaluation Focus

### Stated Problem Or Symptom

"Robotaxis will compete with Uber and car sales."

### Actual Problem

How to position for the removal of the *ownership premise* — the shift of personal
mobility from owning a depreciating idle asset to buying a service, and the
reorganization of the dealer/finance/residual/OEM/fuel/parking value chain around
miles and fleets — rather than a robotaxi-vs-ride-hail skirmish.

### Deleted Assumptions

- That the unit of analysis is the car, not its *ownership*.
- That automakers keep selling ~units while adding a robotaxi line.
- That the dealer/finance complex shrinks gently rather than fighting (franchise law).
- That "you own or you hail" is binary (the owned-fleet hybrid is a third state).

### Hidden Variable

The substrate is *private ownership of the vehicle*, not the vehicle. The dealer,
finance, residual, fuel, and parking economies all exist because households own idle,
depreciating cars they must drive themselves. Remove the self-driving requirement and
the ownership rationale erodes — and the *ownership fork* (pure service vs.
owned-fleet hybrid) decides who captures the value.

### Frame Recovery Target

Reframe "robotaxi vs. Uber" → "removal of the ownership premise"; map the value chain
(breadth); game out depth chains (franchise-law fight, residual collapse, OEM
unit→miles, fuel/parking) and the ownership fork; synthesize. Recognize this is
Sub-cluster D of the FSD "perfect Pepsis," sibling to A/B/C.

### Generated Idea Target

A `ZeitgeistSynthesisPayload` whose `details` contain the breadth map + depth chains +
the ownership fork + synthesis, plus thesis/audience/signals/why-now/falsifiable
prediction/prior art.

### Scoring Notes

- High: recovers the ownership substrate; maps the chain; >=3 deep chains incl. the
  franchise-law fight and the residual→leasing/ABS knock-on; games the ownership fork
  both ways (pure service vs. owned-fleet hybrid); falsifiable, well-timed; cites
  ownership→service prior art (cloud, streaming) without leaning on it.
- Medium: sees ownership decline but stays first-order, or misses the fork.
- Low: "robotaxis vs. Uber / car sales drop" only.
- Subtype check (`zeitgeist_synthesis`): grounding, novelty, market timing
  (±5-year), coherence, falsifiability.

## Solution

### Summary

Treat autonomy as the removal of the ownership premise. A self-driven, idle,
depreciating private car stops penciling for many households → mobility shifts from
ownership to service → the $1.69T auto-credit complex, the 16,972-dealer franchise
system, residual values, the OEM unit-sales model, fuel retail, and parking
reorganize around miles and fleets. Who wins turns on the ownership fork.

### Details

`ZeitgeistSynthesisPayload`:

- **thesis:** Autonomy attacks the *premise of car ownership*, not the car; as a
  self-driven, idle (~95%), depreciating private asset stops making sense, personal
  mobility shifts from ownership to service, and the value chain reorganizes around
  miles (not units) and fleets (not households) — unwinding the $1.69T auto-credit
  complex, the legally fortified 16,972-dealer franchise system, residual values, the
  OEM unit-sales model, fuel retail, and parking. The decisive variable is the
  ownership fork: pure service (ownership dies; value to fleet operators/platforms)
  vs. the owned-autonomous-fleet hybrid (Tesla — ownership becomes an income-producing
  asset).
- **audience:** Automaker, auto-finance/banking, dealer, insurance, real-estate
  (parking), and energy-retail strategists; auto-ABS investors.
- **currentSignals:**
  - Credit: US auto-loan balance $1.69T (NY Fed, 2026Q1) — a record high.
  - Dealers: 16,972 franchised light-vehicle dealers, $645B sales, 1.13M employed,
    137M repair orders / $81B service+parts (NADA, 2025); state franchise laws
    entrench the model.
  - Utilization: privately owned cars sit idle ~95% of the time (commonly-modeled
    estimate) — the core inefficiency a fleet attacks.
  - Leading indicator: Tesla's running state-by-state fights against dealer-franchise
    laws to sell direct.
  - Autonomy deploying and becoming legal (Signal Set D4) + own-the-stack economics
    (umbrella case), making per-mile fleet service viable.
- **whyNow:** Autonomy crossing to legal deployment (umbrella case) makes
  cheap per-mile mobility real for the first time, at a moment of record auto debt and
  an EV transition already pressuring dealers (less service revenue) and fuel retail.
  In 2020 owning was the only option and there was no scaled service substitute; by
  ~2030 the ownership-vs-service reorganization is consensus.
- **breadthMap (the economy built on *owning* the car):** new + used dealerships and
  the franchise system (+ state franchise-protection laws); auto lending/financing,
  leasing, F&I, GAP/extended warranties, subprime-auto and dealer-floorplan lenders;
  the used-car market, auctions, trade-in cycle, residual values, auto-ABS; the OEM
  business model (units → miles/fleets) and the supplier base; aftermarket parts,
  independent repair, quick-lube, tires; fuel retail / gas stations / c-stores
  (compounds with EV); parking (garages, lots, driveways, valet) and its operators.
- **depthChains (game each two-to-three steps down):**
  - *Ownership → dealers + the franchise-law fight:* owning an idle depreciating asset
    stops penciling for many → new+used unit sales fall and/or shift to fleet buyers →
    the 16,972-dealer franchise system contracts → but state franchise laws bar OEMs
    from selling direct/to fleets, so a state-by-state legal/lobbying war erupts
    (Tesla's direct-sales fights are the leading indicator) → dealers consolidate,
    pivot to service, or litigate. *Alternate gaming:* dealers entrench politically and
    slow the transition region-by-region (an adoption-asymmetry seam).
  - *Residuals → leasing/credit/ABS:* fleets + autonomy crush used-vehicle residual
    values → lease math breaks (residuals are the lease's backbone), trade-in equity
    evaporates, and auto-ABS + dealer balance sheets re-rate → a credit-market
    knock-on touching the $1.69T loan book. *Alternate gaming:* a transition glut of
    cheap used human-driven cars depresses prices first, *before* fleets dominate.
  - *OEM model flip (units → miles):* automakers shift from selling ~units to selling
    availability per mile → margin per mile, not per car → because one utilized fleet
    car replaces many idle private ones, total unit volume falls structurally →
    suppliers, parts, and the aftermarket (137M repair orders, $81B) shrink as
    standardized fleets self-maintain → the OEM that owns the stack + the fleet
    (Tesla's bet) captures recurring per-mile revenue; the rest become hardware
    vendors.
  - *Fuel + parking unwind:* fewer privately owned cars + EVs → gas stations/c-stores
    hollow (compounding B's travel-stop unwind) → parking demand collapses → the
    *demand* collapse is here (D), while the reclaimed *land/redevelopment* is B's
    geography; curb/valet/meter economies shrink (meter *fines* are C).
  - *The ownership fork (game both ways — the decider):* pure service (Uber/Waymo; you
    don't own) → ownership dies, the dealer/finance/insurance retail complex collapses
    hardest, value accrues to fleet operators + the platform. Owned-fleet hybrid
    (Tesla) → you own one and it earns as a robotaxi while idle → ownership *transforms*
    into an income-producing asset: the dealer model still dies (direct sales) but the
    credit and insurance complex survives mutated (financing/insuring an income asset),
    and households capture some fleet yield. The adoption-asymmetry lens governs which
    world arrives where.
- **synthesis (what it converges to):** The American car is not just transport; it is
  an *owned asset* around which a $1.69T credit complex, a legally fortified
  16,972-dealer retail system, a residual market, the automaker unit-sales model, fuel
  retail, and a continent of parking are built. Autonomy makes the self-driven, idle,
  depreciating private asset irrational, shifting mobility from ownership to service —
  so the chain reorganizes around miles, not units, and fleets, not households. The
  value migrates to whoever owns the stack + the fleet (and, in the hybrid world,
  partly to owner-operators), while the dealer/finance/residual/fuel/parking
  intermediaries shrink or mutate. Who captures it is set by the ownership fork. One of
  four convergences in the FSD cluster.
- **falsifiablePredictions:**
  1. By 2031, >=1 major automaker reports a structural shift of revenue toward
     fleet/per-mile/subscription and away from retail unit sales, citing autonomy.
  2. By 2032, measurable contraction/consolidation in the franchised-dealer count
     and/or a new wave of state franchise-law fights over direct/fleet sales.
  3. By 2032, a used-vehicle residual-value decline attributable to autonomous fleets
     is flagged by a lender or rating agency as pressuring auto-lease/auto-ABS.
  4. [Lower-confidence] By 2033, >=1 large market shows declining per-capita car
     ownership in autonomy-served metros, with fleet/robotaxi miles substituting.
- **comparablePriorArt:** Mainframe → cloud (own the asset → rent the service; the
  value moved to whoever ran the fleet of servers); CDs → streaming and landlines →
  mobile (ownership → access); horse ownership → the automobile (an entire ownership-
  and-care economy — stables, farriers, livery — replaced); and the live leading
  indicator, Tesla's direct-sales fights against state dealer-franchise laws. Used to
  stress-test, not as the argument.

### Why This Solution

It fits the recovered problem (removal of the ownership premise + the ownership fork)
rather than the symptom ("robotaxi vs. Uber"), is grounded, falsifiable, and
timing-specific.

### Tradeoffs

- AV penetration pace and the ownership-vs-service mix are uncertain (the fork).
- Franchise laws and dealer politics can slow the unwind region-by-region.
- Some players mutate rather than vanish (finance/insurance in the hybrid world).
- The ~95%-idle figure is an estimate; don't present it as audited.

### Expected Outcome

If correct, capital positioned in stack-owning fleet operators and per-mile platforms
(and, in the hybrid world, owner-operator yield) outperforms the dealer/floorplan/
residual/fuel-retail complex.

### Next Steps

- Track OEM revenue-mix disclosures, dealer-count + franchise-law fights, used-vehicle
  residuals + auto-ABS, and per-capita ownership in early-AV metros.

## Reproducible

### Is Reproducible

Yes, approximately.

### Reproducibility Level

Approximate.

### Steps

1. Provide the withheld case.
2. Ask for Problem Recovery, then the breadth map + depth chains + the ownership fork
   + synthesis.
3. Score against the Evaluation Focus and subtype checks.

### Required Inputs

- Withheld case, evaluator version.

### Expected Result

Full value-chain map + deep chains + the ownership fork + falsifiable, well-timed
thesis.

### Known Variability

Many defensible maps; the ownership-substrate reframe and the fork separate strong
from weak.

## Validator

### Name Or Role

Automotive / auto-finance / dealer / auto-ABS analyst.

### Relationship To Case

Can judge breadth, depth, and falsifiability.

### Can Validate

- The value-chain map and depth chains.
- Plausibility of the franchise-law fight and the residual→ABS knock-on.
- Falsifiability of predictions.

### Validation Method

Rubric review.

## Open Questions

- How fast does the ownership-vs-service mix tip, and where first (the lens)?
- Which players mutate vs. break, and how does the hybrid world change the answer?

## Notes

Sub-cluster D of the `full-self-driving-unlock` cluster; score the ownership-substrate
reframe, the value-chain breadth+depth, and the ownership fork. Its synthesis should
reference that it is one convergence among four.
