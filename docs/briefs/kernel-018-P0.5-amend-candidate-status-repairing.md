# /tdd brief — amend_candidate_status_add_repairing

## Feature
Freeze amendment (lesson §19 playbook, 3rd application): add `repairing` to the frozen `CandidateStatus` closed enum (8→9) so the §3 candidate repair edge `created→repairing→under_review` / `repairing→invalid` is representable + persistable, and bump `CURRENT_SCHEMA_VERSION` 3→4. Additive/backward-compatible (v1/v2/v3 envelopes still validate; closure preserved). **Lead-ratified, kernel-owned scoped exception** (the user's `degraded` ruling applied to this identical §3-FIX-edge class).

## Use case + traceability
- **Task ID:** P0.5-amend (freeze amendment; dedicated SOLO slice; companion to kernel-016 / P0.15-amend).
- **Architecture sections it implements:** `ARCHITECTURE.md §3` (Candidate state machine — `created → repairing → under_review` on a successful repair [line 165], `repairing → invalid` budget-exhausted [line 150]), §4 (schemaVersion).
- **Precedent:** kernel-016 (`a1da497`) — `GenerationStatus` +`degraded`, `CURRENT_SCHEMA_VERSION` 2→3. **THIS slice is mechanically identical** (CandidateStatus instead of GenerationStatus; 3→4 instead of 2→3).
- **Origin + ruling:** FINDING #2 (impl at P3.2 Step-2.5; orchestrator-verified): frozen `CandidateStatus` (P0.5) omitted `repairing` that §3 + P3.2's candidate machine require. **Lead RATIFIED** (the user's `degraded` ruling applied to this identical class; user flagged for awareness, no re-ask). **Mechanic = clean v3→v4 (NOT a fold into v3):** `a1da497` already records v3=degraded with its fixtures; a clean follow-up bump beats re-opening v3's fixtures, and the lead does ONE cross-track merge carrying both v3+v4 deltas anyway — so the bump costs nothing extra in propagation.

## Acceptance criteria (what "done" means)
- [ ] `CandidateStatus` has exactly **9 members** — the 8 existing (created/under_review/checked/scored/selected/rejected/culled/invalid) + **`repairing`**; `CandidateStatus.parse('repairing')` succeeds.
- [ ] **Closure preserved:** an out-of-set value (e.g. `'bogus'`/`''`) is still rejected (additive, not a loosening).
- [ ] `CURRENT_SCHEMA_VERSION === 4` (bumped from 3); the `version.ts` comment updated to the 4th era (v4 = +`repairing` Candidate, following v3 = +`degraded` Generation, v2 = operation-start markers).
- [ ] **Backward-compatible:** a `RunEventEnvelope` with `schemaVersion` 1/2/3/4 all validate (readers accept `≤ current`); 0/neg/non-int rejected; the P1.8 replay ceiling now rejects `> 4`. **`a1da497`'s v3 fixtures are NOT re-opened** (3 ≤ 4 — they stay valid).
- [ ] The `CandidateStatus` member-set **schema-snapshot** is updated to the 9-member set and is green.
- [ ] Fixtures re-recorded as needed: `test-fixtures/index.ts` auto-stamps `CURRENT_SCHEMA_VERSION` (→ 4) — confirm; re-record any literal-`schemaVersion` pin in contracts (same 3 move-with-the-bump pins kernel-016 touched: the entities-lineage `CURRENT_SCHEMA_VERSION` pin, the field-sets version pin, the `canonical_fixtures_still_valid_at_current_version` label). **apps/api `schemaVersion: 2` fixtures stay valid (2 ≤ 4) — verify green, do NOT churn.**
- [ ] **Full suite green across BOTH packages** — contracts (165 + the repairing/v4 asserts) AND apps/api (121 unit / 20 integration unchanged).
- [ ] `/preflight` clean.
- [ ] **Step-9 re-flag the lead "amendment ready"** (v4 surface settled: schemaVersion now 4, Generation 9 + Candidate 9) so it does the ONE kernel→cody merge carrying both v3+v4 deltas + notifies verifier/selection/demo to re-record GenerationStatus(9) + CandidateStatus(9) snapshots.

## Wiring / entry point (Step 7.5)
**none — contract amendment** (a frozen enum + the version constant). Consumer is the next slice **kernel-019** (the candidate state machine's `created→repairing→under_review` / `repairing→invalid` edges, now legal at the append boundary). No production wiring here.

## Files expected to touch
**Modified (all `packages/contracts` — the lead-ratified scoped exception):**
- `packages/contracts/src/domain/candidate-idea.ts` — add `repairing` to `CandidateStatus` (place per §3 — after `created`, the `created→repairing` source; cosmetic).
- `packages/contracts/src/version.ts` — `CURRENT_SCHEMA_VERSION` 3→4 + version-history comment.
- the `CandidateStatus` member-set snapshot test (the `__schema-snapshots__/*` that enumerates `CandidateStatus`) + any version pin (mirror the 3 kernel-016 touched).
- `packages/contracts/test/domain/candidate-idea.test.ts` — assert `repairing` accepted + closure still rejects unknown.
- `packages/contracts/test/events/envelope.test.ts` — add a `schemaVersion: 4` accept assertion (1/2/3 still parse).
- `packages/contracts/src/test-fixtures/index.ts` — verify it auto-stamps the constant (→4); re-record if any literal slipped.

If a fixture/snapshot beyond this needs re-recording, that's expected §19 work — note at Step 9 (same class kernel-016 hit).

## RED test outline (Step 2)
`packages/contracts/test/domain/candidate-idea.test.ts`:
1. **`candidate_status_includes_repairing`** — `CandidateStatus.parse('repairing')` ok; positive guard `CandidateStatus.parse('created')` too.
   - Why: §3 — repairing is a first-class candidate state.
2. **`candidate_status_rejects_unknown_preserved`** — `CandidateStatus.parse('bogus')` throws.
   - Why: closure preserved (lesson §1).

Snapshot test:
3. **`candidate_status_member_set_snapshot`** — `CandidateStatus.options` === the 9-member frozen snapshot.
   - Why: lesson §1 member-set snapshot (the amendment diff is visible + intentional).

Version assertions (`envelope.test.ts`):
4. **`current_schema_version_is_4`** — `CURRENT_SCHEMA_VERSION === 4`.
5. **`envelope_schema_version_acceptance`** — `RunEventEnvelope.parse({...valid, schemaVersion: 4})` ok; 1/2/3 still parse; 0/non-int throw.
   - Why: §4 reader-acceptance window; backward-compat (incl. v3 not re-opened).

> **Positive-guard discipline (lesson §10):** each reject test leads with a positive parse guard.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field change:** YES — `CandidateStatus` 8→9 (+`repairing`) + `CURRENT_SCHEMA_VERSION` 3→4. Cross-doc invariant change on a frozen §2.5 seam.
- **Orchestrator doc rows I write hot (Step 9):** `apps/api/CLAUDE.md` `CandidateIdea` row (`CandidateStatus` closed **8→9** +`repairing`) + RunEventEnvelope row (`CURRENT_SCHEMA_VERSION`=**4**) [track-local] + `ARCHITECTURE.md` Appendix-A `CandidateStatus` + schemaVersion → **cody** (ledger; update §A0 so v3+v4 = schemaVersion 2→4, Generation 9 + Candidate 9, ONE merge). **Escalation already done** (finding escalated; lead ratified).
- **§2.5-seam model touched?** YES — `CandidateStatus` crossed by §2.5 edges. The member-set snapshot (test 3) is the required pin. Lead sequences the ONE cross-track propagation (v3+v4 together).

## Things to flag at Step 2.5
1. **`repairing` placement** — after `created` (matches the §3 `created→repairing` source) vs append-at-end? My vote: **after `created`** (readability; snapshot records the set either way). Cosmetic.
2. **schemaVersion bump 3→4 — confirm.** Clean follow-up bump (NOT a fold into v3) per the lead's ratified mechanic — mechanically identical to kernel-016's 2→3. My vote: **bump to 4**. Blast radius clean: the hardcoded `schemaVersion: 2` (apps/api) + `schemaVersion: 3` (a1da497 contracts) fixtures stay valid (≤ 4), NOT churned.
3. **Fixture/snapshot re-record scope** — mirror the 3 move-with-the-bump pins kernel-016 updated (entities-lineage version pin, field-sets version pin, the canonical-fixtures-at-current-version label) + the CandidateStatus member-set snapshot. My vote: verify-and-leave everything else; apps/api untouched.

## Dependencies + sequencing
- **Depends on:** kernel-016 (`a1da497`, v3 exists) ✓. Sequenced AFTER P3.2-partial (the 3 machines) commits.
- **Blocks:** kernel-019 (the candidate state machine — `repairing` edges), which completes P3.2.

## Estimated commit count
**1 — SOLO invariant slice** (lesson §19; frozen §2.5 contract → never bundled). **security-reviewer in the loop** (invariant — closure-preservation + additive/backward-compat + no-loosening; `repairing` is a status not an event, rule-#8 n/a). `feat(contracts)` (additive = non-breaking).

## Lessons-logged candidates anticipated
- **§19 tightening (likely):** when the prior amendment's schemaVersion is already committed WITH its fixtures, a clean follow-up bump (v3→v4) beats re-opening the committed version's fixtures — even when both deltas merge cross-track together in one propagation. (The fold-into-unreleased-version path is viable only before the prior bump's fixtures are committed.) I bank this into §19 at Step 9.

## How to invoke
1. **Read this brief end-to-end** + the kernel-016 commit (`a1da497`) — this is that, retargeted to `CandidateStatus` + 3→4.
2. **Run `/tdd amend_candidate_status_add_repairing`**.
3. **Step 0/1** — confirm restatement + file list; confirm the constant goes to 4.
4. **Step 2.5** — send the per-test write-up + coverage map; confirm Q2 (bump 3→4). Take defaults or ping back.
5. **Step 9** — re-flag "amendment ready" (v4 surface settled) for the lead's single cross-track merge; surface any extra fixture/snapshot re-records.
