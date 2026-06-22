# /tdd brief — amend_generation_status_add_degraded

## Feature
Freeze-amendment (lesson §19 playbook): add `degraded` to the frozen `GenerationStatus` closed enum (8→9 members) so the §3 partial-failure edge `running → degraded → verifying` is representable + persistable, and bump `CURRENT_SCHEMA_VERSION` 2→3. Additive + backward-compatible (old `schemaVersion` 1/2 envelopes still validate; closure preserved — unknown statuses still rejected). **User-ratified, scoped exception** to the no-contract-edit guardrail — THIS amendment only.

## Use case + traceability
- **Task ID:** P0.15-amend (freeze amendment; dedicated SOLO slice BEFORE P3.2 — per lead/user ruling).
- **Architecture sections it implements:** `ARCHITECTURE.md §3` (state machines — `Generation: running → degraded → verifying` resolved FIX edge; "degraded = first-class status, distinct from failed/running"), §4 (schemaVersion + reader acceptance `≤ current`).
- **Precedent:** the P0.1-amend (`dc493a3` impl / `4cefad4` re-seal) — RunEventType 25→36 + `CURRENT_SCHEMA_VERSION` 1→2. Same playbook, mechanically.
- **Origin:** OPEN FINDING (kernel orchestrator, 2026-06-21): frozen `GenerationStatus` (P0.15) omitted `degraded` that §3 + P3.2 require — verified, lead+user-ratified to amend (option a); kernel owns it.

## Acceptance criteria (what "done" means)
- [ ] `GenerationStatus` has exactly **9 members** — the 8 existing (pending/running/verifying/scoring/reproducing/completed/failed/skipped) + **`degraded`**; `GenerationStatus.parse('degraded')` succeeds.
- [ ] **Closure preserved:** an out-of-set value (e.g. `'bogus'`) is still rejected (the amendment is additive, not a loosening).
- [ ] `CURRENT_SCHEMA_VERSION === 3` (bumped from 2); the version.ts comment updated to reflect the 3rd schema era + the additive/forward-compat note.
- [ ] **Backward-compatible:** a `RunEventEnvelope` with `schemaVersion` 1, 2, OR 3 all validate (readers accept `≤ current`); `schemaVersion` 0 / non-int still rejected; the replay reader (P1.8) still rejects `> current` (now `> 3`).
- [ ] The `GenerationStatus` member-set **schema-snapshot** (`packages/contracts/test/__schema-snapshots__/entities-lineage-field-sets.test.ts`, + `contract-surface.test.ts` if it enumerates it) is updated to the 9-member set and is green.
- [ ] Fixtures re-recorded as needed: `packages/contracts/src/test-fixtures/index.ts` auto-stamps `CURRENT_SCHEMA_VERSION` (→ 3) — confirm; re-record any literal-`schemaVersion` fixture in contracts. **apps/api hardcoded `schemaVersion: 2` fixtures stay valid (2 ≤ 3) — verify green, do NOT churn them.**
- [ ] **Full suite green across BOTH packages** — contracts (163 + the new degraded/version assertions) AND apps/api (121 unit / 20 integration unchanged; the schemaVersion-2 fixtures still pass).
- [ ] `/preflight` clean.
- [ ] **Step-9 flag to the lead:** send "GenerationStatus amendment ready" so the lead sequences the kernel→cody merge + notifies verifier/selection/demo to re-record their GenerationStatus snapshots (additive → non-urgent; none use `degraded` yet).

## Wiring / entry point (Step 7.5)
**none — this is a contract amendment** (a frozen enum + a version constant). Its consumer is the next slice **P3.2** (the generation state machine's `running→degraded→verifying` edge, now legal at the append boundary). No production wiring in this slice.

## Files expected to touch
**Modified (all `packages/contracts` — the scoped exception):**
- `packages/contracts/src/domain/generation.ts` — add `degraded` to `GenerationStatus`.
- `packages/contracts/src/version.ts` — `CURRENT_SCHEMA_VERSION` 2→3 + comment.
- `packages/contracts/test/__schema-snapshots__/entities-lineage-field-sets.test.ts` — `GenerationStatus` member-set 8→9 (+ `contract-surface.test.ts` if it snapshots it).
- `packages/contracts/test/domain/generation.test.ts` — assert `degraded` accepted + closure still rejects unknown.
- `packages/contracts/test/events/envelope.test.ts` — add a `schemaVersion: 3` accept assertion (1 + 2 still parse).
- `packages/contracts/src/test-fixtures/index.ts` — verify it stamps `CURRENT_SCHEMA_VERSION` (auto → 3); re-record if any literal slipped.

If a fixture/snapshot beyond this list needs re-recording, that's expected playbook work — note it at Step 9 (not scope creep).

## RED test outline (Step 2)
`packages/contracts/test/domain/generation.test.ts`:
1. **`generation_status_includes_degraded`** — `GenerationStatus.parse('degraded')` succeeds; positive guard `GenerationStatus.parse('running')` too.
   - Why: §3 — degraded is a first-class status.
2. **`generation_status_rejects_unknown_preserved`** — `GenerationStatus.parse('bogus')` throws.
   - Why: closure preserved (additive, not a loosening) — lesson §1.

`packages/contracts/test/__schema-snapshots__/entities-lineage-field-sets.test.ts`:
3. **`generation_status_member_set_snapshot`** — `GenerationStatus.options` === the 9-member frozen snapshot.
   - Why: lesson §1 member-set snapshot (the amendment's diff is visible + intentional).

`packages/contracts/test/events/envelope.test.ts` (+ version assertion):
4. **`current_schema_version_is_3`** — `CURRENT_SCHEMA_VERSION === 3`.
5. **`envelope_schema_version_acceptance`** — `RunEventEnvelope.parse({...valid, schemaVersion: 3})` ok; `1` + `2` still parse; `0` / non-int throw.
   - Why: §4 reader-acceptance window; backward-compat.

> **Positive-guard discipline (lesson §10):** each reject test leads with a positive parse guard.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field change:** YES — `GenerationStatus` 8→9 (+`degraded`) + `CURRENT_SCHEMA_VERSION` 2→3. **This IS a cross-doc invariant change** on a frozen §2.5 shared contract.
- **Orchestrator doc rows I write hot (Step 9):** the `apps/api/CLAUDE.md` cross-doc `Run`/`Generation` row (GenerationStatus closed 8→**9**, add `degraded`) + the `RunEventEnvelope` row (`CURRENT_SCHEMA_VERSION`=**3**) + `ARCHITECTURE.md` Appendix-A `GenerationStatus` + schemaVersion (→ **cody**, shared root — via the routing ledger; I do NOT edit the stale-fork copies). **Escalation already done** (the finding was escalated + lead/user-ratified).
- **§2.5-seam model touched?** YES — `GenerationStatus` is crossed by §2.5 edges (verifier/selection/demo). The member-set snapshot (test 3) IS the required schema-snapshot pin. Lead handles cross-track propagation post-merge.

## Things to flag at Step 2.5
1. **`degraded` placement in the enum** — after `running` (matches the §3 `running→degraded→verifying` reading order) vs append-at-end? My vote: **after `running`** (readability; the snapshot updates either way — it records the set, and the ordered `.options` reflects placement). Cosmetic; either is correct.
2. **schemaVersion bump to 3 — confirm.** Per the lead + lesson §19 (extend closed enum ⇒ bump schemaVersion), even though `GenerationStatus` is a domain enum (not the envelope `type` like the P0.1-amend's RunEventType). My vote: **bump to 3** — follows the project convention + the lead's directive; blast radius is clean (the hardcoded `schemaVersion: 2` fixtures in apps/api stay valid since 2 ≤ 3; the ≤CURRENT ceiling is the reader's job, not the envelope schema's). Flag at Step 2.5 if you see a principled reason NOT to version a domain-enum change.
3. **Fixture re-record scope** — `test-fixtures/index.ts` auto-stamps the constant (→ 3). My vote: **verify-and-leave** — re-record only contracts literals that break; do NOT touch apps/api's `schemaVersion: 2` fixtures (they still validate + still test the older-version path). Confirm the full apps/api suite stays green against the bump.

## Dependencies + sequencing
- **Depends on:** nothing new (amends already-frozen P0.15 + P0.1 version constant).
- **Blocks:** **P3.2** (the generation state machine's `running→degraded→verifying` edge) — this slice unblocks the finding. Lands BEFORE P3.2.

## Estimated commit count
**1 — SOLO invariant slice** (lesson §19: "amend a frozen contract before/within the active track as a SOLO invariant slice"). It's a frozen §2.5 shared-contract change → never bundled. **security-reviewer in the loop** (invariant — closure-preservation + additive/backward-compat + no-loosening are the pins; `degraded` is a status not an event, so rule-#8 no-energy-debit is n/a). `feat(contracts)` (additive = non-breaking feat, per P0.1-amend precedent).

## Lessons-logged candidates anticipated
- Likely none new — this IS the lesson §19 playbook applied a 2nd time (P0.1-amend was the 1st). If anything, a one-line §19 note that the playbook now has a 2nd, post-fork instance (kernel-owned, user-ratified scoped exception) — I decide at Step 9.

## How to invoke
1. **Read this brief end-to-end** + skim lesson §19 + the P0.1-amend commits (`dc493a3`) for the mechanical precedent.
2. **Run `/tdd amend_generation_status_add_degraded`**.
3. **Step 0/1** — confirm restatement + file list.
4. **Step 2.5** — send the per-test `Asserts: <invariant> (§anchor)` write-up + coverage map; confirm Q2 (the schemaVersion bump). Take defaults or ping back.
5. **Step 9** — flag "GenerationStatus amendment ready" for the lead's cross-track merge sequencing; surface any extra fixture/snapshot re-records.
