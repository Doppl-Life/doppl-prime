# /tdd brief — check_result_and_allowlist

## Feature
Freeze the `CheckResult` contract (id, candidateId, checkType, status, score?, output?, skipReason?, evidenceRefs[], error?) with the closed 3-state status (`passed | failed | skipped`) and the **skipped⇒skipReason** correlation, AND the `CheckRunnerAdapter` **allowlist-registry** shape — a **non-executing** adapter descriptor (NO arbitrary-code field is representable) keyed by adapter ID, plus a pure allowlist gate that maps an unregistered/unsupported id to a `skipped` CheckResult rather than executing. **SAFETY slice** — key safety rule #3 (no arbitrary code execution; REQ-S-003 / §7 / §14). Own commit, never bundled.

## Use case + traceability
- **Task ID:** P0.7
- **Architecture sections it implements:** `ARCHITECTURE.md §7` (line 270 — "subtype-specific objective checks run **only** through a static allowlist registry of `CheckRunnerAdapter`s, keyed by adapter ID, mirroring the model registry; adapters are **non-executing** for MVP (no arbitrary code); an unregistered or execution-requiring check is rejected and recorded as `check.completed{status:"skipped", reason}`"), §14 + **REQ-S-003** (no arbitrary code execution), §9 (EvidenceRef resolves within the Postgres tier), Appendix A line 474 (`CheckResult` row: id, candidateId, checkType, status(passed/failed/skipped), score?, output?, skipReason?, evidenceRefs[], error?; "adapter allowlist registry").
- **Related context:** Imports `EvidenceRef` from P0.5 (`src/domain/evidence-ref.ts`, barrel) for `CheckResult.evidenceRefs[]` — do NOT redefine (lesson §5). `CheckResult`/`CheckRunnerAdapter` are §2.5 shared contracts crossed by the checks→selection seam (Appendix A) — schema-snapshots required. Mirrors the P0.6 safety-by-shape pattern (lesson §9): the **non-executing** invariant is pinned as the ABSENCE of any code-carrying field, enforced by `z.strictObject` + snapshot. Mirrors the P0.6 single-source-primitive pattern (lesson §8 / wrapUntrusted): the allowlist gate (`resolveCheckAdapter`) lives IN the frozen contract so every consumer rejects-unregistered identically. The actual adapter registry contents + check execution land in the verifier/check-runners track (P4); this slice freezes the **shape + the allowlist gate semantics**. Lesson §6: shape is the schema's job; the registry CONTENTS (which adapters exist) are P4's.
- **Architecture gap flagged:** Appendix A row 474 enumerates `CheckResult`'s fields but does NOT enumerate `CheckRunnerAdapter`'s fields. This brief proposes a minimal descriptor (Q2); if GREEN settles it, the orchestrator adds the field detail to the Appendix A `CheckRunnerAdapter` row at Step 9 (architecture-doc note) — NOT invented silently.

## Acceptance criteria (what "done" means)
- [ ] `CheckResult.status` is the CLOSED 3-state union `passed | failed | skipped`; any other value rejected.
- [ ] `CheckResult` carries EXACTLY: `id`, `candidateId`, `checkType`, `status`, `score?`, `output?`, `skipReason?`, `evidenceRefs`, `error?` — unknown field rejected; the required fields (`id`, `candidateId`, `checkType`, `status`, `evidenceRefs`) mandatory; the `?` fields omittable.
- [ ] **`skipped ⇒ skipReason` correlation:** a `skipped` CheckResult WITHOUT a (non-empty) `skipReason` is rejected; `passed`/`failed` do not require `skipReason` (§7 — a skip is always recorded with a reason).
- [ ] `evidenceRefs` is an array of `EvidenceRef` (imported from P0.5); may be empty (lesson §6); a nested bad-`kind` ref rejected.
- [ ] `checkType` is an open non-empty string (the allowlist REGISTRY is the gate, not a closed type enum — mirrors `ModelRoute.modelId`); `score?`/`output?`/`error?` per Q6.
- [ ] **`CheckRunnerAdapter` is non-executing by shape (safety rule #3):** a strict descriptor carrying NO code-carrying field — a payload adding `exec` / `command` / `handler` / `fn` / `script` / `code` is rejected (strict + frozen field-set snapshot is the structural pin; REQ-S-003).
- [ ] `CheckRunnerAdapter` descriptor fields per Q2 (default `id`, `checkType`, `subtype?`, `label?`); a `CheckRunnerRegistry` shape keyed by adapter id (Q7).
- [ ] **Allowlist gate (`resolveCheckAdapter`, pure — Q5):** given a registry + a requested adapter id, returns the registered adapter if present, else a `skipped` CheckResult with a `skipReason` (e.g. `unregistered_adapter`) — it NEVER executes and NEVER throws on an unknown id (the rule-#3 fail-safe).
- [ ] `z.infer` types for `CheckResult` + `CheckRunnerAdapter` (+ the registry type, the status enum, `resolveCheckAdapter`) exported from the barrel.
- [ ] **Schema-snapshot tests (§2.5 gate, tagged `spec(§7)`):** `CheckResult` field-set + `status` member-set (3) + `CheckRunnerAdapter` field-set equal checked-in frozen snapshots.
- [ ] All unit tests pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
Entry point = the `@doppl/contracts` barrel exports `CheckResult`, `CheckRunnerAdapter` (schemas + `z.infer` types), the `CheckStatus` enum, the `CheckRunnerRegistry` type, and `resolveCheckAdapter`. Consumed downstream by the **check-runners / verifier track (P4)** — it populates the registry with non-executing adapters and dispatches via `resolveCheckAdapter` (unregistered → skipped), emitting `CheckResult`; the `check.completed` event payload (P0.10) reuses `CheckResult`. `none — runtime wiring (registry contents + dispatch) lands in the verifier/check-runners track (P4)`. Reachability = barrel-exported + schema-snapshot-covered + the `resolveCheckAdapter` allowlist gate unit-tested.

## Files expected to touch
**New:**
- `packages/contracts/src/checks/check-result.ts` — `CheckResult` + `CheckStatus`.
- `packages/contracts/src/checks/check-runner-adapter.ts` — `CheckRunnerAdapter` + `CheckRunnerRegistry` + `resolveCheckAdapter`.
- `packages/contracts/test/checks/{check-result,check-runner-adapter}.test.ts`
- `packages/contracts/test/__schema-snapshots__/check-field-sets.test.ts`

**Modified:**
- `packages/contracts/src/index.ts` — re-export the above.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN. (`src/checks/` is a new subdir.)

## RED test outline (Step 2)
1. **`check_status_closed_3_union`** *(spec §7)* — Asserts: `passed`/`failed`/`skipped` parse; `'errored'`/`''` rejected. Why: §7 closed status.
2. **`check_result_accepts_valid_and_strict`** *(spec §7)* — Asserts: full CheckResult round-trips (with + without the optionals); unknown top-level field rejected; each required field mandatory. Why: Appendix-A §7 shape. (Leads with a positive parse guard — lesson §10.)
3. **`check_result_skipped_requires_reason`** *(spec §7, rule #3)* — Asserts: `{status:'skipped'}` without `skipReason` REJECTED; with non-empty `skipReason` accepted; `passed`/`failed` accepted without `skipReason`; `skipReason:''` rejected. Why: §7 a skip is always recorded with a reason.
4. **`check_result_evidence_and_optionals`** — Asserts: `evidenceRefs` array of EvidenceRef, nested bad-`kind` rejected, `[]` ok; `score?`/`output?`/`error?` per Q6 types. Why: §9 composition + §7 optionals.
5. **`check_runner_adapter_rejects_code_field`** *(spec §7/§14, rule #3 / REQ-S-003)* — Asserts: `{...validAdapter, exec:'…'}`, `{...validAdapter, command:'…'}`, `{...validAdapter, handler:()=>{}}`, `{...validAdapter, script:'…'}`, `{...validAdapter, code:'…'}` each REJECTED; valid descriptor parses. Why: non-executing by shape — no arbitrary-code field representable. (Leads with positive guard — lesson §10.)
6. **`check_runner_adapter_fields_strict`** *(spec §7)* — Asserts: the exact descriptor field-set; unknown rejected; required mandatory. Why: §7 allowlist descriptor shape.
7. **`resolve_check_adapter_allowlist_gate`** *(spec §7, rule #3)* — Asserts: `resolveCheckAdapter(registry, registeredId)` returns the adapter; `resolveCheckAdapter(registry, 'nope')` returns a `skipped` CheckResult with a non-empty `skipReason` — and NEVER throws / never returns an executable. Why: the allowlist fail-safe (unregistered → skipped, never execute).
8. **`barrel_exports_check_contracts`** *(spec §2.5)* — Asserts: `CheckResult`/`CheckRunnerAdapter`/`CheckStatus`/`CheckRunnerRegistry`/`resolveCheckAdapter` re-exported from `@doppl/contracts`. Why: §2.5 single import boundary.
9. **`schema_snapshot_check_result_adapter`** *(spec §7/§2.5)* — Asserts: `CheckResult` field-set + `status`(3) + `CheckRunnerAdapter` field-set == frozen snapshots. Why: §2.5 cross-track regression gate.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NEW — `CheckResult`, `CheckRunnerAdapter` (+ `CheckStatus`, `CheckRunnerRegistry`, `resolveCheckAdapter`).
- **§2.5-seam model touched?** **YES** — both shared (checks→selection). RED outline MUST include the schema-snapshots (#9).
- **Orchestrator doc rows to write hot:** add cross-doc rows for `CheckResult`/`CheckRunnerAdapter` (§7). **Architecture-doc note:** if GREEN settles the `CheckRunnerAdapter` descriptor fields (Appendix A under-specifies them), the orchestrator adds the field detail to the Appendix A row §7. **Safety-relevant:** any change to the non-executing pin (a code-carrying field becoming representable) or the allowlist-gate semantics is a Step-9 Finding (escalate), not a silent edit.

## Things to flag at Step 2.5
1. **`skipped ⇒ skipReason` modeling — flat strictObject + `.refine` (Option A) vs `z.discriminatedUnion('status', …)` (Option B).** My default vote: **Option A — flat `z.strictObject` + a `.superRefine` requiring `skipReason` when `status==='skipped'`.** Only one field is conditionally-required and NO field's TYPE swaps by status, so a refine fits better than a discriminated union (lesson §7's DU was for type-swapping payloads; this isn't one) — and the snapshot stays a single clean field-set. Flag if you'd rather a status-discriminated union.
2. **`CheckRunnerAdapter` descriptor fields (Appendix A under-specifies).** My default vote: **`{ id, checkType, subtype?, label? }`** — `id` the allowlist key, `checkType` the open string it handles, `subtype?` (the `Subtype` it applies to, optional/both), `label?` human description. Flag a different field set; whatever lands, I add it to Appendix A at Step 9.
3. **`checkType` — open string (Option A) vs closed enum (Option B).** My default vote: **Option A — `z.string().min(1)`** (the allowlist REGISTRY is the gate, mirroring `ModelRoute.modelId`; the specific check kinds are MVP-evolving + subtype-specific, lesson §6). Flag if you want a closed checkType enum.
4. **Non-executing pin (safety rule #3).** My default vote: `CheckRunnerAdapter` = `z.strictObject` of exactly the descriptor fields, so any code-carrying field (`exec`/`command`/`handler`/`fn`/`script`/`code`) is rejected — pinned by strict + the field-set snapshot + the negative test #5 (parallels lesson §9). Confirm the adversarial field list is complete enough.
5. **`resolveCheckAdapter` pure gate in scope? (Option A) yes vs (Option B) shapes-only.** My default vote: **Option A — YES**, a pure `(registry, id) => CheckRunnerAdapter | CheckResult(skipped)` lives in the contract so the allowlist fail-safe (unregistered → skipped, never execute) is single-source + testable now (mirrors P0.6 `wrapUntrusted`; the allowlist IS rule #3). It selects/rejects by id — it does NOT execute, so it stays pure + contract-appropriate. Flag if you'd rather leave resolution entirely to P4 (then this slice is shapes-only + the allowlist invariant is pinned only structurally).
6. **`score?` / `output?` / `error?` types.** My default vote: `score: z.number().optional()` (permissive range — lesson §6), `output: z.string().optional()`, `error: z.string().optional()`. Flag if `output` should be structured.
7. **`CheckRunnerRegistry` shape.** My default vote: `z.record(z.string(), CheckRunnerAdapter)` keyed by adapter id (mirrors the model registry). Flag if you want an array + a derived index.
8. **Commit count.** My default vote: **1 — SAFETY slice, own commit, never bundled** (rule #3). Commit: `feat(contracts): CheckResult + CheckRunnerAdapter allowlist (P0.7)`.

## Dependencies + sequencing
- **Depends on:** P0.5 (imports `EvidenceRef` — landed in `49f77f3`).
- **Blocks:** P0.10 (`check.completed` payload reuses `CheckResult`), P0.14 (contract-test surface), the check-runners/verifier track (P4).

## Estimated commit count
**1** — SAFETY slice (key safety rule #3, no arbitrary code execution; REQ-S-003). Gets its OWN commit, never bundled.

## Step-8 reviewer policy
**security-reviewer: FAN OUT** — invariant-touching (rule #3 allowlist / non-executing). Review surface = the slice diff; a finding on the non-executing pin or the allowlist-gate fail-safe escalates as a Step-9 `Finding`. code-quality-reviewer stays `phase-boundary`.

## Lessons-logged candidates anticipated
- **Convention candidate** — "An allowlist/registry safety invariant is pinned two ways: (1) non-executing BY SHAPE — `z.strictObject` makes a code-carrying field unrepresentable (lesson §9 applied to rule #3); (2) a single-source pure gate that fails safe to `skipped` on an unregistered id (lesson §8 pattern)."
- **Architecture-doc note candidate** — enumerate `CheckRunnerAdapter`'s descriptor fields in Appendix A row 474 (currently unspecified) once GREEN settles them.

## How to invoke
1. **Read this brief end-to-end.** Q1 (skipReason correlation), Q5 (allowlist gate in scope), Q2 (adapter fields) are the load-bearing calls.
2. **Run `/tdd check_result_and_allowlist`.**
3. **Step 0/1** — confirm restatement + file list; confirm `EvidenceRef` is IMPORTED from P0.5 (not redefined) and `src/checks/` is a new subdir.
4. **Step 2.5** — send the test-design write-up (per-test `Asserts` + per-acceptance-bullet coverage map) + answers to the 8 questions. Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 7→8** — security-reviewer fans out (invariant slice).
6. **Step 9** — categorized flags + ship-ask; any change to the non-executing pin / allowlist gate is a Finding.
