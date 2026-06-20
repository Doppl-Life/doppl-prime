# Case Study: Full Self-Driving Is Solved — Now Game Out the Unlock (Evaluator)

## Summary

The consensus prices autonomy as "robotaxis someday, scored by fleet count." The
synthesis target re-prices the moment: vision-based self-driving is **solved** (the
work left is the March of Nines, not feasibility) and **now legal** to deploy
driverless in multiple states. The approach bet: the cost/quality curve bends only
for the player who owns the whole stack — builds the car, runs camera-only (a BOM
that compresses), ships OTA updates to the entire fleet, and learns from every
mile — while a LiDAR/retrofit cost structure cannot compress or update its sensors
over the air, so "deployed scale" there is inventory, not a lead. The deliverable
is the **gamed-out non-obvious cascade** (where the puck goes, where the money
goes) plus a synthesis. This file carries the evaluator targets and the withheld
synthesis; it must never be shown during generation.

## Source

### Type

Article synthesis, market signals, and a strong directional prior.

### Origin

Public reporting on autonomy deployment, the build-vs-retrofit cost contrast, and
the crash-cost base.

### Source File

`../sources.md` (Signal Set D).

### Derived By

Doppl capstone team.

### Fidelity

Heavily synthesized. The thesis stakes a directional claim ("solved; March of
Nines"); the contestable variables are completion timing + legality + the approach
bet. Predictions are analytical bets, not fact.

### Source Notes

References:

- EVANNEX, unsupervised Tesla robotaxi (in-car monitor removed Jan 2026; Austin
  metro-wide June 2026): https://evannex.com/blogs/news/teslas-robotaxi-now-covers-all-of-austin-metro-area
- Automotive World, fleet/version status and the camera-vs-LiDAR, build-vs-retrofit
  contrast: https://www.automotiveworld.com/news/tesla-robotaxi-fleet-hits-25-as-musk-defers-scale-to-fsd-v15/
- Not a Tesla App, FSD v14→v15 end-to-end architecture and OTA model:
  https://www.notateslaapp.com/news/4035/tesla-confirms-fsd-v15-will-run-on-hw4-shares-release-date
- Crash cost base for the acknowledged visible branch — NHTSA 2024 (39,254
  deaths): https://rosap.ntl.bts.gov/view/dot/89790 ; NHTSA economic cost (~$340B
  / ~$1.4T): https://crashstats.nhtsa.dot.gov/Api/Public/ViewPublication/813403.pdf ;
  TRIP (~$1.83T societal harm 2024): https://www.atssa.com/news/trip-report-analyzes-traffic-safety-crisis-and-identifies-solutions/

## Visibility

### Level

Public.

### Anonymized

No private individuals.

### Public Summary Allowed

Yes, with caveat (not investment advice; sober on human cost).

### Sensitive Details

- Predictions are bets, not facts.
- Treat deaths/injuries soberly.

### Sharing Notes

Evaluator file. Keep targets out of any generation prompt.

## Evaluation Focus

### Stated Problem Or Symptom

"Self-driving is a maybe-someday robotaxi race; score it by which company has the
most cars deployed, and it mostly disrupts Uber/taxis."

### Actual Problem

How to position for a regime in which vision-based autonomy is **solved and now
legal**, captured by whoever owns the full stack (vehicle + compute + OTA + fleet
data), whose largest effects are a non-obvious second- and third-order cascade
across travel, real estate, labor, insurance, public finance, and the diffusion of
machine vision — not how to win or score the ride-hail market.

### Deleted Assumptions

- That feasibility is the open question (it is timing/completion + legality).
- That fleet count today indicates who wins (curve and stack-ownership do).
- That a LiDAR/retrofit cost structure can compress like a camera-only own-built
  one.
- That the impact is bounded by ride-hail / the visible accident economy.
- That perception built for driving stays in cars.

### Hidden Variable

Two-part why-now misread: (1) the capability is solved (coyote already off the
cliff) and simultaneously becoming legal — both gates open at once in 2025–2026;
(2) the value accrues to stack ownership (build cost, camera BOM, OTA, fleet
learning), so "deployed scale" on an unsound cost structure is not leadership. The
consensus has the right signal (AVs arriving) but the wrong frame (maybe-someday)
and the wrong scorecard (fleet count, not curve).

### Frame Recovery Target

Re-price the moment to "solved + now-legal"; make the own-the-stack vs.
retrofit/LiDAR argument; treat the visible branch (ride-hail, accident economy) as
necessary-but-brief; spend the answer gaming out the **non-obvious** cascade and
synthesizing it. Recognize the discovered-attack + unlock structure.

### Generated Idea Target

A `ZeitgeistSynthesisPayload` whose `details` game out the cascade in multiple
branches with a synthesis: thesis + audience + cited signals + why-now (solved +
legal) + >=1 dated falsifiable prediction + comparable prior art.

### Scoring Notes

- High: re-prices the moment; makes the approach argument; recognizes this is a
  *cluster* of convergences (perfect Pepsis), not one thesis; games out >=3
  branched, non-obvious chains drawn from the **fertile** ground (accident economy,
  door-to-door travel, labor + reclaimed time, geography, and the governing
  adoption-asymmetry lens); synthesizes "what it all converges to"; falsifiable,
  well-timed; cites prior art (the car *creating and destroying* economies;
  containerization) without leaning on it. Going *deep* on the accident economy
  (breadth + hidden dependents) is a strength, not a weakness — see the
  `fsd-accident-economy` sibling. (Vision-substrate/Optimus and fleet-compute are
  deliberately de-scoped as less fertile for non-obvious conclusions.)
- Medium: gets "more than ride-hail" but stays shallow / unbranched, or collapses
  the cluster into a single thesis, or finds no hidden dependents.
- Low: "robotaxis beat Uber," "Waymo is ahead so they win," or "maybe someday."
- Subtype check (`zeitgeist_synthesis`): grounding, novelty vs consensus,
  audience/market timing (±5-year test), internal coherence, falsifiability.
- **Note for graders:** do *not* reward hedging on feasibility or counting fleets;
  the fixture's stake is that feasibility is settled. Reward the depth and
  falsifiability of the cascade.

## Solution

### Summary

Re-price the moment: vision-based autonomy is solved (March of Nines) and now
legal, and it is captured by whoever owns the stack — the camera-only, own-built,
OTA, fleet-learning curve compresses where a LiDAR/retrofit cost structure cannot.
Then recognize the *shape*: this is a "perfect Pepsis" — one unlock detonating into
a cluster of convergent regime changes, each its own case. The accident-dependent
economy (drafted deep as `fsd-accident-economy`) is the most *visible* entry and
rewards going deep, not skipping; alongside it run travel/door-to-door economics,
geography/real estate, labor + reclaimed human time, vision-as-substrate (the same
engine that drives a car powers a humanoid, just slower), and the higher-variance
fleet/distributed-compute moat. It all converges to a re-pricing of time, space,
and risk — AI/NVIDIA-scale in how many domains it quietly reorganizes at once.

### Details

`ZeitgeistSynthesisPayload`:

- **thesis:** Vision-based self-driving is solved (what remains is the March of
  Nines) and now legal; it is won by whoever owns the whole stack (build cost +
  camera-only BOM + OTA + fleet learning), and — crucially — its consequences do
  **not** reduce to a single thesis. This is a "perfect Pepsis" situation: a single
  unlock that detonates into a *cluster* of convergent regime changes (the ARK-style
  convergence of several exponential/L-curves arriving at once), each its own
  zeitgeist case. The market's "maybe-someday, scored-by-fleet-count" framing
  misprices both the moment (solved, scaling) and the *shape* (a cluster, not one
  disruption) — and it is a gold mine of second/third-order convergences the way
  AI/NVIDIA touched everything.
- **audience:** Cross-sector strategists/investors (mobility, real estate, travel,
  insurance, public finance).
- **currentSignals:**
  - Camera-only, end-to-end autonomy driving **unsupervised** (no in-car monitor)
    across a major US metro, improving via OTA updates to the whole fleet
    (EVANNEX; Not a Tesla App).
  - Own-built vehicles + manufacturing scale = cost control and integration;
    competitors run high-cost LiDAR suites retrofitted onto vehicles they do not
    build and cannot OTA-update (Automotive World) — a cost structure that does
    not compress.
  - Regulatory gate opening: states (TX; CA progressing) permitting driverless
    operation in 2025–2026.
- **whyNow:** Both gates open at once — capability is solved (the open question is
  the last nines, not feasibility) and driverless operation is becoming legal. In
  2020 it was neither solved nor legal (sci-fi); by ~2030 the cascade is consensus
  and priced in. The market is the coyote past the cliff edge, not yet looking
  down.
- **clusterMap (the heart — "perfect Pepsis"; note it is not one cascade but four
  distinct sub-clusters plus a governing lens, each member draftable as its own
  case):** The sub-clusters share one root (autonomy) but converge on *different
  substrates*, so they cluster separately. **Gaming heuristic to apply throughout —
  "the event falls away" (dry-riverbed test):** for each downstream institution ask
  *is this a cost that drops, or an event that disappears?* The disappearing-event
  branches (the crash, the ticket, the stop) are the highest-magnitude and
  least-priced — the incumbent keeps fighting a current in a riverbed that's now dry.
  - **Sub-cluster A — the accident economy (risk/harm removal):** what unwinds when
    the *crash* goes away.
  - **Sub-cluster B — mobility & time (driver/friction removal):** what re-prices when
    the *driver and the cost of distance* go away.
  - **Sub-cluster C — the enforcement & compliance economy / "traffic-state"
    (driver-as-subject removal) [DRAFTED: `fsd-enforcement-economy`]:** what collapses
    when the human stops being a *policeable, fineable, registrable* driver.
  - **Sub-cluster D — the ownership unwind / car-as-a-service (car-as-owned-asset
    removal) [DRAFTED: `fsd-ownership-unwind`]:** what reorganizes when *owning* a car
    stops making sense.
  - **Governing lens — adoption asymmetry:** orthogonal to all four; how and for whom
    each sub-cluster lands.
  - Seams are real and interesting (truck stops are trucking-labor *and*
    roadside-economy [A/B]; DUI/reckless fines are crash-caused [A/C]; parking-the-
    asset/land is geography [B] while parking-the-fine is enforcement [C] and the
    parking-demand collapse is ownership [D]; personal-lines insurance is harm [A] but
    its unwind is also an ownership effect [D]; registration/sales-tax revenue spans
    C/D; the served/unserved boundary makes each unwind county-by-county [lens]).

  *— Sub-cluster A (risk/harm removal) —*
  - *A0 — the accident-dependent economy [DRAFTED: `fsd-accident-economy`]:* the most *visible* entry, and precisely for that reason
    worth going deep on — breadth (insurance underwriting + agent channel,
    personal-injury law, trauma medicine, collision repair, locally fine-funded
    budgets, driver's ed/DMV, towing) and depth (the hidden dependents: insurer ad
    spend funds media; young trauma deaths are the high-yield organ supply;
    small-town fine budgets; the license as national ID). Not "brief" — a full
    member of the cluster. Do not dismiss it.
  *— Sub-cluster B (driver/friction removal: mobility & time) —*
  - *One case, told in chapters [DRAFTED: `fsd-mobility-and-time`]:* not separate
    sibling cases — one convergence (remove the driver + the friction of distance →
    re-price time and distance) told as chapters of a single story. *Chapter 1 —
    door-to-door travel:* cheap, sleepable autonomous point-to-point beats the
    four-hour door-to-door reality of a short flight in the 200–700-mi band (half of
    US flights, car already dominant, sub-3-hour rule) → short-haul aviation hollows,
    the vehicle becomes a hotel/office (sleeper-pod class). *Chapter 2 — labor +
    reclaimed time:* ~3M driving jobs and a $175–200B roadside/travel-center economy
    unwind, freight cost collapses, and ~1 hr/day/person of commute attention is
    reclaimed as the new prize. *Chapter 3 — geography:* sleeper-commuting detaches
    the radius from daily drive time → secondary cities re-rate, parking is reclaimed,
    megaregions weld into single labor markets. Synthesis = re-pricing of time and
    distance. (The truck stop sits on the seam with Sub-cluster A.)
  *— Sub-cluster C (driver-as-subject removal: the enforcement & compliance economy /
  "traffic-state") [DRAFTED: `fsd-enforcement-economy`; fine/DMV/forfeiture material
  migrated out of `fsd-accident-economy` so A stays harm-only] —*
  - *One case (candidate): what collapses when the human stops being a policeable,
    fineable, registrable driver.* Autonomous cars obey by construction, so the
    *violation* (speeding, red lights, rolling stops, "ticky-tack" moving violations)
    doesn't occur → traffic-fine revenue collapses and the "speed-trap town" (the
    Ferguson fiscal model — municipalities funded on fines/fees) faces a budget
    crisis. Deeper: the **traffic stop is the most common police–citizen contact and
    the legal gateway (pretext stop, *Whren v. US*) to vehicle searches, drug
    interdiction, warrant service, and civil-asset forfeiture** → no human driving →
    no pretext → that entire enforcement-and-forfeiture pipeline loses its on-ramp
    (and the "driving while ___" disparity vector with it). The **culpability unit
    vanishes** ("I was in the back seat" — you can't cite a passenger): liability
    moves from ~240M individual drivers to a few fleet operators/OEMs, emptying the
    highest-volume court docket in the US (traffic court, ticket-defense bar, DUI bar,
    points/surcharge systems). The **compliance apparatus** loses its subject
    (registration, safety inspection, emissions [already dying via     EVs], license-as-
    leverage/ID, the DMV's enforcement role). ***"The state wants its money"
    (game out as its own branch):*** governments don't let a revenue line die quietly
    — as fines + registration + forfeiture + the fuel tax dry up at once, the state
    claws it back, and the same metered fleet makes **VMT / road-use / congestion
    pricing** trivial to implement. The citizen trades a *pretext-stop* surveillance
    regime for a *total-movement-metering* one (a surveillance bargain), and there is
    a real fight (police unions, municipalities, the ticket/DUI bar resisting). *Seams:*
    DUI/reckless fines are crash-caused → A/C; parking-the-asset → B's geography, but
    parking-the-fine + meters + parking-enforcement → C; registration/sales-tax
    revenue → C/D.
  *— Sub-cluster D (car-as-owned-asset removal: the ownership unwind / car-as-a-service)
  [DRAFTED: `fsd-ownership-unwind`] —*
  - *One case (candidate): what reorganizes when owning a car stops making sense.* The
    private car is idle ~95% of the time, depreciates, and exists because *you* needed
    to drive it. Cheap autonomous mobility attacks the *ownership premise*, not just the
    product → the automotive retail/finance stack reorganizes: **dealerships** (~16,000
    franchised dealers, protected by **state franchise laws** → another
    incumbent-won't-go-down legal/lobbying fight); **auto lending/financing** (~$1.6T
    US auto-loan debt), leasing, F&I, extended warranties; the **used-car market**,
    trade-in cycle, and residual values (fleets + autonomy crush residuals);
    **automakers flip** from selling units to selling miles/fleets (margin per mile),
    while aftermarket/parts/independent repair shrink as standardized fleets
    self-maintain; **gas stations/fuel retail** (compounds with EV); and **parking/
    driveways/garages/lots** demand collapses. ***The fork to game both ways:*** pure
    service (you don't own — Uber/Waymo → ownership *dies*) vs. owned-autonomous-fleet
    hybrid (Tesla — you own one and it *earns* as a robotaxi while idle → ownership
    becomes an income-producing asset, not a dead one). Tesla's bet is the hybrid; the
    fork decides who wins and interacts with the adoption-asymmetry lens. *Seams:*
    personal-lines insurance unwind → A/D; registration/sales-tax revenue → C/D;
    parking land reclaimed/redeveloped → B/D.
  *— De-scoped (overlap existing ground; less fertile for non-obvious conclusions) —*
  - *vision-as-substrate / Optimus [DE-SCOPED]:* "solving real-world vision" diffuses
    perception into everything, and a humanoid is the same unlock slower. Noted, not a
    priority — overlaps AI/robotics ground.
  - *fleet / distributed compute [DE-SCOPED]:* fleet hive-mind learning + idle-fleet
    distributed compute. Overlaps the firm-power/compute ground.
  *— Governing lens (spans both sub-clusters) —*
  - *adoption asymmetry / the unevenly distributed future
    [DRAFTED: `fsd-adoption-asymmetry`]:* autonomy arrives as a geofenced patchwork,
    not a wave, opening a perception gulf (believers vs. disbelievers), an
    intra-national divergence (served vs. lagging metros), and a first/third-world
    split (with a leapfrog wildcard). This is the **governing lens**: it determines
    *how and for whom* every other branch lands. "The future is already here — just
    not evenly distributed."
- **synthesis (what it all converges to):** No single branch is "the" thesis, and it
  is not one cascade — it is **four convergences sharing one root**. Sub-cluster A
  (risk/harm removal) collapses the ~$1.8T accident substrate and everything that
  priced, litigated, repaired, and treated human error. Sub-cluster B
  (driver/friction removal) re-prices *time and distance* — reclaiming human hours,
  collapsing the cost of moving people and goods, and dissolving the airport-shaped
  map. Sub-cluster C (driver-as-subject removal) collapses the *enforcement &
  compliance economy* — the fines, the probable-cause/forfeiture pipeline, the traffic
  courts, and the registration/inspection apparatus built on the fallible, policeable
  human driver (and forces the state to claw revenue back via movement-metering).
  Sub-cluster D (car-as-owned-asset removal) reorganizes the *ownership economy* —
  dealerships, the $1.6T auto-credit complex, residual values, and the automaker
  unit-sales model — into mobility-as-a-service. Across all four, the deepest effects
  are *disappearing events*, not falling costs (the dry-riverbed test). Together they
  amount to a **re-pricing of time, distance, risk, ownership, and state authority
  over the citizen-in-motion**, and the **adoption-asymmetry lens** governs how
  unevenly that arrives. These are several
  L-curves cresting together — the "perfect Pepsis." The unseen winners are whoever
  owns the stack plus the picks-and-shovels of compute/energy/sensors; the unseen
  losers are the institutions that monetized human driving, human error, and the old
  map. Like AI/NVIDIA, the magnitude comes not from one effect but from how many
  domains it quietly reorganizes at once — and each member above is its own drawable
  case.
- **falsifiablePredictions:**
  1. By end of 2027, an own-the-stack operator runs unsupervised (no in-car safety
     driver) robotaxi service in ≥5 US metros.
  2. By 2028, a camera-only stack publishes a safety record (miles per critical
     intervention) at or above the human baseline in a major metro, without LiDAR.
  3. By 2030, at least one LiDAR/retrofit robotaxi operator exits, restructures, or
     pivots off the per-vehicle cost problem.
  4. [Lower-confidence] By 2030, the same perception stack ships in a non-vehicle
     product (humanoid or third-party), evidencing the vision-as-substrate unlock.
- **comparablePriorArt:** The automobile itself — it *created* the roadside economy
  (gas stations, motels, suburbs, drive-throughs) and destroyed the
  livery/blacksmith/farrier economy; autonomy unwinds part of what the car created
  and dissolves the geography flight imposed (symmetric). Containerization —
  collapsing the cost of moving goods reorganized global trade and minted unseen
  winners (ports, logistics, finance) far from the box maker. Elevators —
  automation eliminated the operator and unlocked the skyscraper. Used to
  stress-test, not as the argument.

### Why This Solution

It fits the recovered problem (a solved-and-legal regime change captured by stack
ownership, with a non-obvious cascade) rather than the stated symptom
(maybe-someday robotaxis), is grounded, falsifiable, and timing-specific, and does
the gaming-out the case is built to elicit.

### Tradeoffs

- The "solved" stake is directional; the honest risk is the *pace* of the last
  nines and the state-by-state legal rollout, which the predictions encode.
- Which institutions restructure vs. unwind is uncertain (insurance likely
  restructures around fleet/product liability rather than vanishing).
- The fleet/distributed-compute branch is speculative; hold at lower confidence.
- Human-cost framing must stay sober — the upside is fewer deaths, not a market.

### Expected Outcome

If correct, capital and policy that re-price the moment and follow the non-obvious
cascade outperform those scoring a maybe-someday fleet-count race.

### Next Steps

- Track the four predictions against deployment, safety disclosures, competitor
  cost structure, and non-vehicle perception products.
- Watch travel/door-to-door substitution and parking/curb repricing as the
  earliest non-obvious tells.

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

Re-pricing of the moment + the approach argument + a deep, branched non-obvious
cascade with synthesis and falsifiable predictions.

### Known Variability

Many defensible cascades; depth/branching/falsifiability separate strong from
weak.

## Validator

### Name Or Role

Mobility/insurance/real-estate/public-finance analyst or autonomy strategist.

### Relationship To Case

Can judge grounding, the approach argument, cascade depth, and falsifiability.

### Can Validate

- Frame recovery and the cost-structure argument.
- Plausibility and depth of the cascade.
- Falsifiability of predictions.

### Validation Method

Rubric review.

## Open Questions

- How fast do the last nines and the legal rollout arrive?
- Which institutions restructure vs. unwind, and how fast?
- How large/soon is the vision-as-substrate and humanoid spillover?

## Notes

Treat as a public synthesis case with a fidelity caveat on *timing*, not
feasibility. The corpus's reference *discovered-attack + unlock* fixture; score
re-pricing the moment and the depth/falsifiability of the gamed-out cascade. Do
not reward feasibility-hedging or fleet-count scoring.
