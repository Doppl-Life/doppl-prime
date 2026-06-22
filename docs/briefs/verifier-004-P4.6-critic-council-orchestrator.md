# /tdd brief — critic_council_orchestrator

## Feature
The **critic council orchestrator**: for each active critic mandate, build a gateway request via the
P4.4 candidate-as-DATA isolation seam under the `critic` ModelRole, run it through the gateway
(validate/repair≤1/reject), assemble + validate a `CriticReview` (council sets the trusted identity
fields; the model fills the evidence fields), persist an accepted review as a `critic.reviewed` event
(with `critic.review_started` marker + provider/trace metadata), and persist a rejected output as
`output_schema_rejected` (that mandate yields NO fabricated review). The council returns the set of
`CriticReview`s ONLY — it can never select a winner, mutate candidates/lineage, or alter scoring policy
(rule #6, emit-only by construction).

## Use case + traceability
- **Task ID:** P4.6
- **Architecture sections it implements:** `ARCHITECTURE.md §7` (critic council emits structured evidence
  only; gateway-routed; validate/repair/reject), `§4` (critic.review_started marker + critic.reviewed
  event; no energy debit on markers), `§14` (candidate-as-DATA isolation).
- **Related context:**
  - Key safety rule #6 (critics emit evidence only — never select/mutate/alter policy — anti-reward-hacking);
    rule #5 (candidate reaches the critic only as sentinel-delimited DATA, via P4.4); rule #8 (markers debit
    no energy; the energy debit for a successful critic call is the kernel's job — P3.5 — NOT the council).
  - **P4.4 isolation seam (landed `860567f`):** `assembleIsolatedRequest({role, instruction, candidate, schema?, maxTokens?})` → `ModelGatewayRequest` (candidate sentinel-wrapped in a user message, instruction in the system message). The council MUST build every critic request through it (the single no-bypass chokepoint).
  - **Gateway (fake stub for now):** `selectGateway({useStub:true})`/`createFakeGateway()` → `ModelGateway.call(request) → ModelGatewayResponse {accepted, output?, validationResult, providerMeta, langfuseTraceId?, rejection?}`. The fake's `critic` fixture returns a MINIMAL `{critique, confidence}` (NOT a full CriticReview) — so the council assembles the rest (see Q1).
  - **Frozen contracts (adopt):** `CriticReview` (P0.6: id/candidateId/mandate/scores/critique/confidence/evidenceRefs — strict, emit-only by shape), `CriticMandate` (closed 5: factual_grounding/novelty_prior_art/feasibility/falsification/subtype_specific), `ModelRole` ('critic'). `scores` may be `{}`, `evidenceRefs` may be `[]` (lesson 6).
  - **Event store (P1.3):** `store.append(AppendInput)`; `critic.reviewed`←`CriticReview` (HIGH_TRAFFIC_PAYLOAD_MAP, fail-closed on append); `critic.review_started`/`output_schema_rejected`/`provider_call_failed` are in the frozen 36-member registry. Integration pattern: `apps/api/test/integration/event-store/append.test.ts`.

## Acceptance criteria (what "done" means)
- [ ] For each active mandate, the council builds the critic request **only** via `assembleIsolatedRequest` (candidate as sentinel-wrapped DATA, never interpolated into the instruction) under the `critic` ModelRole — never a direct provider/gateway request bypassing the seam.
- [ ] An accepted gateway response is assembled into a **schema-valid `CriticReview`** where the council sets the trusted identity fields (`id`, `candidateId`, `mandate`) and the model supplies the evidence fields (`critique`, `confidence`, `scores`, `evidenceRefs`) — the model **never** controls `id`/`candidateId`/`mandate` (reward-hacking defense).
- [ ] The `CriticReview.id` is **deterministic** (derived from run/candidate/mandate context — no `Math.random`/`Date.now`), so replay reconstructs the same review id.
- [ ] An accepted review is persisted as a `critic.reviewed` event (payload = the validated `CriticReview`) with the gateway response's provider metadata + langfuse trace/observation ids on the envelope.
- [ ] Each mandate emits the `critic.review_started` marker (actor `critic`, generic payload) BEFORE the call — and that marker debits **no energy** (the council emits no `energy.spent`; energy is P3's ledger).
- [ ] A rejected/un-repairable critic output is persisted as `output_schema_rejected` and yields **NO** `CriticReview` for that mandate (never a fabricated review).
- [ ] The council's return value is the set of accepted `CriticReview`s ONLY — it exposes no winner/selection/mutation/score-policy output (emit-only, rule #6).
- [ ] The active mandate set is an **injected parameter** (critic-set rotation is P4.7 — this slice runs whatever set it is given).
- [ ] All unit tests in `apps/api/test/unit/verifier/council/*.test.ts` pass; the integration test in `apps/api/test/integration/verifier/council/run-council.test.ts` passes against real Postgres; `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none (full runtime invocation) — first consumer is the P3 generation `verifying` phase** (which calls
the council per candidate with the rotated mandate set from P4.7). The council is exercised end-to-end
via the integration test (fake gateway + real append path). It takes the `ModelGateway` port + the
`EventStore` port + a `runContext` ({runId, generationId, candidateId}) + the active mandate set — all
injected (no P3/P4.7 dependency for this slice). Confirm at Step 7.5: every critic request goes through
`assembleIsolatedRequest` (no bypass) and every persist goes through `store.append` (forbidden #4).

## Files expected to touch
**New:**
- `apps/api/src/verifier/council/critic-call.ts` — `runCriticCall(...)`: assemble (isolation seam) → gateway.call → assemble+validate `CriticReview` (or detect rejection) → emit `critic.review_started`/`critic.reviewed`/`output_schema_rejected`.
- `apps/api/src/verifier/council/run-council.ts` — `runCouncil(...)`: iterate the injected mandate set, return the `CriticReview[]`. Holds the closed `MANDATE_INSTRUCTIONS` map (see Q2).
- `apps/api/test/unit/verifier/council/{critic-call,run-council}.test.ts`; `apps/api/test/integration/verifier/council/run-council.test.ts`.

**Modified:** none. (If the integration glob doesn't pick up `test/integration/verifier/**`, flag at Step 2.5 — P4.5 confirmed `test/integration/**` already covers nested dirs.)

> **Tracker path drift (FYI):** P4.6 cites `apps/api/verifier/council/...`; correct path is `apps/api/src/verifier/council/...`.

## RED test outline
**Unit (`test/unit/verifier/council/*.test.ts`)** — fake gateway + fake EventStore:
1. **`test_critic_request_built_via_isolation_seam`** — Asserts: the gateway receives a request whose candidate is sentinel-wrapped in a user message and absent from the system message (built via `assembleIsolatedRequest`), role `critic`. Why: §14/rule #5 (no bypass).
2. **`test_accepted_output_assembled_into_valid_critic_review`** — Asserts: an accepted `{critique, confidence}` (+optional scores/evidenceRefs) → a `CriticReview.safeParse`-valid review with council-set id/candidateId/mandate, model critique/confidence, defaulted scores `{}`/evidenceRefs `[]` when absent. Why: §7 (assembly).
3. **`test_model_never_controls_identity_fields`** — Asserts: even when the model output carries a `candidateId`/`mandate`/`id`, the assembled review uses the council's known values. Why: §7/rule #6 reward-hacking defense.
4. **`test_review_id_is_deterministic`** — Asserts: same (runContext, mandate) → same `CriticReview.id` across two runs (no random/clock). Why: §4 replay-faithfulness.
5. **`test_council_returns_only_reviews_no_selection`** — Asserts: `runCouncil` returns `CriticReview[]` and exposes no winner/selection/mutation surface (positive guard first, lesson 10). Why: §7/rule #6 emit-only.
6. **`test_rejected_output_yields_no_review`** — Asserts: a gateway `accepted:false` response → no review for that mandate (the council does not fabricate one). Why: §7 (rejection).

**Integration (`test/integration/verifier/council/run-council.test.ts`)** — real PG:
7. **`test_review_started_then_reviewed_per_mandate_in_order`** — Asserts: per mandate, `critic.review_started` (actor `critic`) at seq N then `critic.reviewed` at N+1, in order. Why: §4 marker pairing.
8. **`test_reviewed_payload_is_validated_review_with_provider_meta`** — Asserts: the persisted `critic.reviewed` payload `CriticReview.safeParse`s and equals the assembled review; provider/trace metadata present on the envelope. Why: §7 producer-agreement (lesson 20) + §13 trace metadata.
9. **`test_rejection_emits_output_schema_rejected_no_reviewed`** — Asserts: a rejected mandate (fake gateway `reject` mode) emits `output_schema_rejected`, no `critic.reviewed`. Why: §7 (no silent pass / no fabricated review).
10. **`test_council_marker_debits_no_energy`** — Asserts: the council emits no `energy.spent` for the run. Why: rule #8 (energy is P3's ledger; markers debit nothing).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** Consumes frozen `CriticReview`/`CriticMandate`/`ModelRole` + the frozen event types/payload map. No Appendix-A change.
- **§2.5-seam model touched?** No *change* → no schema-snapshot. The `CriticReview.safeParse` on the persisted `critic.reviewed` payload (test 8) IS the producer-agreement pin (lesson 20).
- **Orchestrator doc rows to write hot (Step 9 routing):** likely **none**. Possible **Architecture-doc note** (§7) naming the council modules as the gateway-routed evidence-only mechanism — flag at Step 9.

## Things to flag at Step 2.5
1. **CriticReview assembly split — council-set identity vs. model-supplied evidence.** My default vote: the council sets `{id, candidateId, mandate}` (trusted, deterministic); the model supplies `{critique, confidence, scores?, evidenceRefs?}`; the council defaults `scores→{}` / `evidenceRefs→[]` when the (minimal fake) output omits them, then validates the assembled whole against `CriticReview`. The model output is parsed against a permissive **critic-model-output** schema (critique+confidence required, scores/evidenceRefs optional) — NOT the full `CriticReview` (the fake returns only `{critique, confidence}`; the real critic via P2.5 supplies more later).
2. **Per-mandate instruction text.** Where does each mandate's critic instruction come from? My default vote: a closed `MANDATE_INSTRUCTIONS: Record<CriticMandate, string>` const in the council module (the rubric/instruction per mandate; trusted, in the system message via the seam). Not a frozen contract — council config.
3. **Candidate-text serialization for the untrusted `candidate` field.** My default vote: a canonical serialization of the `CandidateIdea` (title + summary + claims + subtypePayload) passed as the untrusted `candidate` string to the seam — deterministic, the whole candidate as data.
4. **`CriticReview.id` strategy.** My default vote: a deterministic id derived from `runId`/`candidateId`/`mandate` (e.g. a stable concatenation or hash) — never `Math.random`/`Date.now` (replay-faithful; also the codebase bans those).
5. **Energy + rotation scoping.** My default vote: the council emits NO energy event (energy debit for a successful critic call is the P3 kernel ledger's job — rule #8 success-only — named-deferral); the active mandate set is an injected param (rotation = P4.7). Both are explicit non-goals of this slice.

## Dependencies + sequencing
- **Depends on:** P4.1 `CriticReview`/`CriticMandate` (frozen ✅); P4.4 isolation seam (`860567f` ✅); the fake gateway (P2.9 ✅) + event store (P1.3 ✅). **No P3 dependency** (runContext + mandate set injected).
- **Blocks:** P4.7 (critic-set rotation feeds the council its per-generation mandate set); the P3 `verifying` phase (the real caller).

## Estimated commit count
**1.** One cohesive council unit (critic-call + run-council). Not a safety-pin slice (the rule #5/#6
invariants it relies on are pinned in P4.4 + the frozen `CriticReview` contract — it CONSUMES them), so
it is not bundled-forbidden on safety grounds; but it is a large, self-contained feature with its own
design surface, so it stands alone (NOT bundled with P4.8 judge — divergent design questions + size).
**security-reviewer applies (invariant-touching:** it consumes rule #5 isolation + must preserve rule #6
emit-only + persists authoritative events — a review confirms no bypass/selection path).

## Lessons-logged candidates anticipated
- **Convention candidate** — "a gateway-routed evidence producer sets the TRUSTED identity fields itself (id/candidateId/mandate, deterministic for replay) and lets the model fill only the evidence fields, then validates the assembled whole — the model never controls the correlation/identity of its own output (reward-hacking defense); every request goes through the P4.4 isolation chokepoint; rejection → a failure event, never a fabricated result."
- **Architecture-doc note candidate** — §7: name the council modules as the gateway-routed, evidence-only critic mechanism.
- **Future TODO (next-brief)** — P4.7 critic-set rotation feeds the council its per-generation mandate set deterministically under the run seed; the real critic adapter (P2.5) supplies richer scores/evidenceRefs than the fake.

## How to invoke
1. **Read this brief end-to-end** (session oriented — no `/session-start`).
2. **Run `/tdd critic_council_orchestrator`.**
3. **Step 0/1** — confirm Feature + file list (note the path-drift FYI).
4. **Step 2.5** — answer the 5 design questions (or take defaults); ping the orchestrator before GREEN.
5. **Step 9** — surface anything beyond the anticipated candidates. **security-reviewer applies (invariant-touching).**
