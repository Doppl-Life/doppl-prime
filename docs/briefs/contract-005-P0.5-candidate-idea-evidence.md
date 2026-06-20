# /tdd brief — candidate_idea_and_evidence

## Feature
Freeze the `CandidateIdea` contract (the canonical unit of work) as a subtype-discriminated object, its two subtype payloads (`CrossDomainTransferPayload`, `ZeitgeistSynthesisPayload`), and the `EvidenceRef` shape — with closed unions (8-state status, 6-kind evidence), the `subtype ⟺ subtypePayload` correlation enforced, `z.infer` types, and schema-snapshots. Imports the canonical `Subtype` from P0.3.

## Use case + traceability
- **Task ID:** P0.5
- **Architecture sections it implements:** `ARCHITECTURE.md §3` (CandidateIdea — the canonical unit of work + its 8-state lifecycle; both subtypes share one lifecycle), §4 (`EvidenceRef`), §9 (EvidenceRef resolves WITHIN the Postgres tier), Appendix A + DATA_MODEL.md (subtype payload fields).
- **Related context:** `CandidateIdea` is shared across `runtime·verifier·selection·projection` (§2.5). It imports the closed `Subtype` union frozen in P0.3 (`src/domain/subtype.ts`) — do NOT redefine it (lesson §5). `EvidenceRef` is consumed by P0.6 (`CriticReview.evidenceRefs[]`) and P0.7 (`CheckResult.evidenceRefs[]`), so this slice unblocks them. Lesson §6 applies: the schema encodes shape; resolution (EvidenceRef → Postgres tier) is the P1.7 resolver's job, not the schema's.

## Acceptance criteria (what "done" means)
- [ ] `EvidenceRef` is a strict object: `kind` (closed union `trace | check_output | prior_art | signal | raw_output | other`) + optional `eventId?`, `uri?`, `label?`, `langfuseObservationId?`; any other `kind` rejected.
- [ ] `CrossDomainTransferPayload` is a strict object carrying EXACTLY: `sourceDomain`, `sourceTechnique`, `targetDomain`, `targetProblem`, `transferMapping`, `expectedMechanism`, `executableCheckIdea?` (DATA_MODEL.md).
- [ ] `ZeitgeistSynthesisPayload` is a strict object carrying EXACTLY: `thesis`, `audience`, `currentSignals[]`, `whyNow`, `falsifiablePredictions[]`, `comparablePriorArt[]` (DATA_MODEL.md).
- [ ] `CandidateIdea` carries EXACTLY: `id`, `runId`, `generationId`, `agenomeId`, `subtype`, `title`, `summary`, `claims[]`, `evidenceRefs[]`, `status`, `subtypePayload`.
- [ ] `subtype` is the closed `Subtype` union (imported from P0.3); `status` is a closed 8-state union `created, under_review, checked, scored, selected, rejected, culled, invalid` (§3 Candidate state machine); any other value rejected.
- [ ] **`subtype ⟺ subtypePayload` correlation is enforced:** a `cross_domain_transfer` candidate MUST carry a `CrossDomainTransferPayload` and a `zeitgeist_synthesis` candidate a `ZeitgeistSynthesisPayload` — a mismatched pair is rejected (discriminated union on `subtype`).
- [ ] `evidenceRefs` is an array of `EvidenceRef` (may be empty — a fresh candidate has no evidence yet); `claims` is an array of non-empty strings.
- [ ] All four objects reject unknown fields (strictObject) and missing required fields.
- [ ] `z.infer` types for all four exported from the barrel; `Subtype` is imported from P0.3, not redefined.
- [ ] **Schema-snapshot tests (§2.5 gate, tagged `spec(§3)`/`spec(§4)`):** the `CandidateIdea` field-name set (per discriminated variant), `status` (8), `EvidenceRef` field set + `kind` (6), and each subtype payload's field set equal checked-in frozen snapshots.
- [ ] All unit tests pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
Entry point = the `@doppl/contracts` barrel exports `CandidateIdea`, `CrossDomainTransferPayload`, `ZeitgeistSynthesisPayload`, `EvidenceRef` (+ types, + the `CandidateStatus`/`EvidenceKind` enums). Consumed downstream by runtime (candidate generation), verifier (P0.6/P0.7 reference `EvidenceRef`), selection, projections, and the `candidate.created` event payload (P0.10). `none — runtime wiring lands in the kernel/verifier tracks`. Reachability = barrel-exported + schema-snapshot-covered.

## Files expected to touch
**New:**
- `packages/contracts/src/domain/evidence-ref.ts` — `EvidenceRef` + `EvidenceKind`.
- `packages/contracts/src/domain/subtype-payloads.ts` — `CrossDomainTransferPayload` + `ZeitgeistSynthesisPayload`.
- `packages/contracts/src/domain/candidate-idea.ts` — `CandidateIdea` (subtype-discriminated) + `CandidateStatus`.
- `packages/contracts/test/domain/{evidence-ref,subtype-payloads,candidate-idea}.test.ts`
- extend `packages/contracts/test/__schema-snapshots__/`.

**Modified:**
- `packages/contracts/src/index.ts` — re-export the above.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
1. **`evidence_ref_kind_closed_union`** *(spec §4)* — Asserts: all 6 kinds parse; `'rumor'`/`''` rejected. Why: §4 closed evidence union.
2. **`evidence_ref_optional_pointers_and_strict`** — Asserts: a ref with only `kind` parses (all pointers optional); unknown field rejected. Why: §4 EvidenceRef shape (resolution is P1.7, not the schema — lesson §6).
3. **`cdt_payload_accepts_valid_and_strict`** — Asserts: full CDT payload parses (executableCheckIdea optional); unknown/missing rejected. Why: DATA_MODEL.md CDT shape.
4. **`zeit_payload_accepts_valid_and_strict`** — Asserts: full Zeit payload parses (array fields); unknown/missing rejected. Why: DATA_MODEL.md Zeit shape.
5. **`candidate_accepts_valid_cdt`** — Asserts: a `cross_domain_transfer` candidate + matching CDT payload parses + round-trips. Why: §3 happy path.
6. **`candidate_accepts_valid_zeit`** — Asserts: a `zeitgeist_synthesis` candidate + matching Zeit payload parses. Why: §3 second subtype.
7. **`candidate_subtype_payload_correlation_enforced`** — Asserts: `subtype:'cross_domain_transfer'` with a `ZeitgeistSynthesisPayload` is REJECTED (and the reverse). Why: §3 the discriminated correlation — a mismatched pair is malformed.
8. **`candidate_status_closed_8_state`** — Asserts: all 8 states parse; `'archived'`/`''` rejected. Why: §3 Candidate state machine.
9. **`candidate_evidenceRefs_empty_ok_and_claims_nonempty`** — Asserts: `evidenceRefs:[]` parses; `claims:['']` (empty-string claim) rejected. Why: fresh candidate has no evidence; claims are non-empty.
10. **`candidate_strict_unknown_and_missing`** — Asserts: unknown top-level field + each missing required rejected (within each variant). Why: §3 strict contract.
11. **`schema_snapshot_candidate_payloads_evidence_sets`** *(spec §3/§4/§2.5)* — Asserts: each `CandidateIdea` variant field-set + `status`(8) + `EvidenceRef` field-set + `kind`(6) + CDT payload set + Zeit payload set equal frozen snapshots. Why: §2.5 cross-track regression gate.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NEW — `CandidateIdea`, `CrossDomainTransferPayload`, `ZeitgeistSynthesisPayload`, `EvidenceRef` (+ `CandidateStatus`, `EvidenceKind` unions).
- **§2.5-seam model touched?** **YES** — all four are shared. RED outline MUST include the schema-snapshot tests (#11).
- **Orchestrator doc rows to write hot:** add cross-doc rows for `CandidateIdea §3`, `EvidenceRef §4`, and the two subtype payloads (DATA_MODEL.md / §3). Appendix A already carries `CandidateIdea (+payloads)` and `EvidenceRef` rows — no arch edit unless GREEN surfaces a shape drift.

## Things to flag at Step 2.5
1. **`CandidateIdea` modeling — discriminated union on `subtype` (Option A) vs flat object + `.refine` (Option B).** My default vote: **Option A — `z.discriminatedUnion('subtype', [cdtVariant, zeitVariant])`**, each variant pinning `subtype: z.literal(...)` + the matching `subtypePayload`. It enforces the `subtype ⟺ payload` correlation structurally (a mismatch is unrepresentable). This is structural validity → belongs in the schema (lesson §6). Snapshot covers each variant's field set (both share the same 11 top-level fields, differing only in the subtype literal + payload type). Flag if you'd rather a flat object + `.refine(subtype matches payload)` (simpler `.shape` snapshot, correlation via refine).
2. **`EvidenceRef` pointer requirement — all-optional vs require ≥1 of {eventId, uri}.** My default vote: **all-optional** (per the plan + lesson §6) — a `prior_art` ref may be label-only; the P1.7 resolver decides what's resolvable. Don't refine here. Flag if you want a "≥1 pointer" structural guard.
3. **`claims[]` type — `string[]` vs structured.** My default vote: **`z.array(z.string().min(1))`** (non-empty claim strings). Flag if claims need structure (e.g. `{text, evidenceRefIds}`) — DATA_MODEL.md says claims[]; I read it as strings.
4. **Subtype-payload field types — strings + string arrays.** My default vote: all string fields `z.string().min(1)`; the array fields (`currentSignals`, `falsifiablePredictions`, `comparablePriorArt`) = `z.array(z.string().min(1))`; `executableCheckIdea?` optional string. Flag if any should be structured.
5. **`title`/`summary` minimums.** My default vote: `z.string().min(1)` both.
6. **Snapshot mechanism for a discriminated union.** My default vote: extend the snapshot harness to walk `CandidateIdea.options` and assert each variant's `.shape` key-set (vs a frozen per-variant snapshot) + the discriminant literals. Flag if the harness needs a different shape for unions.
7. **Commit count.** My default vote: **1** — one cohesive candidate-contract slice (CandidateIdea + its payloads + the EvidenceRef it carries); non-safety. Commit: `feat(contracts): CandidateIdea + subtype payloads + EvidenceRef (P0.5)`.

## Dependencies + sequencing
- **Depends on:** P0.3 (imports the `Subtype` union — already landed in `1e4dd4f`).
- **Blocks:** P0.6 (`CriticReview.evidenceRefs[]`), P0.7 (`CheckResult.evidenceRefs[]`), P0.10 (`candidate.created` payload), runtime/verifier/selection tracks.

## Estimated commit count
**1** — cohesive 4-model candidate contract; non-safety (the EvidenceRef→Postgres-tier resolution invariant is the P1.7 resolver's job, not this schema).

## Lessons-logged candidates anticipated
- **Convention candidate** — "A correlated field pair (a discriminant + its dependent payload) is modeled as a `z.discriminatedUnion` so the correlation is structurally unrepresentable-when-wrong, not checked after the fact" (if Option A holds).
- **Architecture-doc note candidate** — none expected (Appendix A + §3 + DATA_MODEL.md already specify these).

## How to invoke
1. **Read this brief end-to-end** (session oriented). Q1 (discriminated union) + Q6 (union snapshot) are the load-bearing calls.
2. **Run `/tdd candidate_idea_and_evidence`.**
3. **Step 0/1** — confirm restatement + file list; confirm `Subtype` is IMPORTED from P0.3 (not redefined).
4. **Step 2.5** — send the test-design write-up + answers to the 7 questions. Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 9** — categorized flags + ship-ask.
