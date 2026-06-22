# /tdd brief — held_out_judge_rubric_load

## Feature
The held-out final-judge **rubric LOAD path**: a pure `loadJudgeRubric(source)` that validates an
already-loaded rubric against the frozen `FinalJudgeRubric` AND enforces the two completeness/immutability
properties the CONTRACT cannot (lesson 6) — the **full 5-axis set is present** and `immutableToAgents`
is `true` — before the rubric can be used to score, returning the validated rubric or throwing a
field-identifying error. Plus the **immutable default rubric** the boot layer loads. **Key safety rule #6
(the held-out judge/rubric is immutable to agents — the bedrock fitness anchor) — solo invariant slice.**

## Use case + traceability
- **Task ID:** P4.3
- **Architecture sections it implements:** `ARCHITECTURE.md §7` (held-out judge + fixed 5-axis 0–5 rubric,
  immutable to agents), `§8` (scoring/policy-versioned), `§14` (held-out judge/rubric immutable to agents —
  the bedrock anchor).
- **Related context:**
  - Key safety rule #6 (the held-out judge, its rubric, and the scoring policy are immutable to agents).
  - **Carry-forward (CONSUMED by this slice):** "Held-out judge LOAD path must validate the rubric before
    use." `FinalJudgeRubric` (P0.15) pins SHAPE only — closed 5-axis `FinalJudgeAxis`, `immutableToAgents:
    z.literal(true)`, required `policyVersion`, no-authority-field — but the CONTRACT cannot enforce (a) a
    no-agent-write path or (b) **full-axis-set completeness** (lesson 6). This slice's load path MUST: load
    from immutable config NEVER an agent-writable path (rule #6 / §14), AND assert the rubric carries the
    FULL 5-axis set + `immutableToAgents:true` before scoring.
  - **Frozen contract already ships the shape** (P0.15, `packages/contracts/src/verifier/final-judge-rubric.ts`):
    `FinalJudgeRubric` (strict 4-field: `axes`/`weights`/`policyVersion`/`immutableToAgents:z.literal(true)`)
    + `FinalJudgeAxis` (closed 5: grounding/novelty/feasibility/falsification_survival/subtype_check_pass).
    **ADOPT — do not redefine.** Note `axes: z.array(FinalJudgeAxis)` validates each element is a valid axis
    but does NOT enforce all 5 present / no-dupes — that's THIS load path's job.
  - **Config-load precedent to mirror:** `packages/contracts/src/config/validate.ts` `validateRunConfig` —
    PURE over already-loaded sources (IO is the boot layer's job, lesson 4), throws a field-identifying
    error so boot fails fast (§15).
  - Contract-test surface (P0.14): `FinalJudgeRubric`/`FinalJudgeAxis` from `@doppl/contracts`.

## Acceptance criteria (what "done" means)
- [ ] `loadJudgeRubric(source)` returns the validated `FinalJudgeRubric` for a rubric that (a) parses against the frozen schema, (b) carries the FULL 5-axis set (all of `FinalJudgeAxis`, no missing axis), and (c) has `immutableToAgents === true`.
- [ ] A rubric **missing any of the 5 axes** is rejected (the completeness check the schema can't do — lesson 6).
- [ ] A rubric with a **duplicate axis** (or otherwise not the exact 5-member set) is rejected.
- [ ] `immutableToAgents` false/omitted is rejected (rule #6 — the flag is unflippable; the schema's `literal(true)` already rejects, the load path re-asserts as the named enforcement point).
- [ ] A missing/empty `policyVersion` is rejected (immutability-via-versioning — the acceptance result references the policyVersion it scored under).
- [ ] A rubric carrying a **mutation/override/authority field** (e.g. `scoreOverride`, `editableBy`, `agentWritable`) is rejected (anti-reward-hacking — strict schema; the load path inherits it).
- [ ] The thrown error is **field-identifying** (names the offending property — boot fails fast, §15).
- [ ] The function is **pure** — it validates an already-loaded `source`, never reads a file/env itself (IO at the boot boundary, lesson 4).
- [ ] An **immutable default rubric** (the MVP held-out rubric, all 5 axes + `immutableToAgents:true` + a `policyVersion`) is provided as a frozen in-code constant (see Q2) and passes `loadJudgeRubric`.
- [ ] All unit tests in `apps/api/test/unit/verifier/judge/rubric.test.ts` pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none (full wiring) — first consumer P4.8 (held-out judge runner) + the P3 boot layer (loads the immutable
default rubric ONCE at startup from a FIXED config source, never an agenome/candidate-derived path).**
The load function + the frozen default const are the deliverable; the boot-wiring is named-deferral to
P4.8/P3 (like P2.4 structured-output before its P3 consumer). Confirm at Step 7.5 the rubric source is a
fixed/immutable const (rule #6 — never an agent-writable path); the load function is pure (source injected).

## Files expected to touch
**New:**
- `apps/api/src/verifier/judge/rubric.ts` — `loadJudgeRubric(source)` (parse + full-axis-set + immutableToAgents assertions, field-identifying error) + `DEFAULT_JUDGE_RUBRIC` (frozen MVP rubric const).
- `apps/api/test/unit/verifier/judge/rubric.test.ts` — unit.

**Modified:**
- none.

> **Tracker path drift (FYI):** P4.3 cites `apps/api/verifier/judge/rubric.ts`; correct path is
> `apps/api/src/verifier/judge/rubric.ts`. The tracker also lists `packages/contracts/src/verifier/judge-rubric.ts (NEW)`
> — already frozen as `final-judge-rubric.ts` (ADOPT, no new contract file). If implementation needs files
> beyond this list, **flag at Step 2.5**.

## RED test outline (apps/api/test/unit/verifier/judge/rubric.test.ts)
1. **`test_loads_valid_full_axis_rubric`** — Asserts: a valid full-5-axis rubric (immutableToAgents:true, policyVersion) → returns the parsed `FinalJudgeRubric` (positive guard FIRST, lesson 10). Why: §7 happy path.
2. **`test_rejects_missing_axis`** — Asserts: a rubric with only 4 of the 5 axes → throws. Why: §7/lesson 6 — full-axis-set completeness the schema can't enforce (the KEY new assertion).
3. **`test_rejects_duplicate_axis`** — Asserts: a rubric whose `axes` duplicates one member (not the exact 5-set) → throws. Why: §7 — the axis set must be exactly the 5.
4. **`test_rejects_immutable_false_or_missing`** — Asserts: `immutableToAgents:false` and omitted both → throw. Why: §14/rule #6 — unflippable anchor flag.
5. **`test_rejects_missing_policy_version`** — Asserts: no/empty `policyVersion` → throws. Why: §8/lesson 12 — immutability-via-versioning.
6. **`test_rejects_authority_field`** — Asserts: a rubric with `scoreOverride`/`editableBy`/`agentWritable` → throws (strict). Why: §14 anti-reward-hacking (lesson 9, no-authority-field).
7. **`test_error_is_field_identifying`** — Asserts: the thrown error message names the offending field. Why: §15 fail-fast boot.
8. **`test_default_rubric_loads`** — Asserts: `DEFAULT_JUDGE_RUBRIC` passes `loadJudgeRubric` and is the full 5-axis immutable rubric. Why: §7 — the MVP held-out rubric is valid + immutable by construction.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** Consumes frozen `FinalJudgeRubric`/`FinalJudgeAxis` (P0.15). No Appendix-A change.
- **§2.5-seam (shared-contract) model touched?** No *change* → no schema-snapshot test. The slice ADDS a load-path enforcement of completeness/immutability that the contract documents as a runtime rule (the `apps/api/CLAUDE.md` `FinalJudgeRubric` row already says "the P4/P5 held-out-judge LOAD path enforces no-agent-write + full-axis-set + `immutableToAgents:true` before scoring").
- **Orchestrator doc rows to write hot (Step 9 routing):** likely **none** (the cross-doc row already anticipates this load path). Possible **Architecture-doc note** (§7/§14) naming `loadJudgeRubric` as the concrete enforcement point — flag at Step 9. **Carry-forward:** I'll mark the held-out-judge-LOAD pointer as P4-CONSUMED (P5 portion still open).

## Things to flag at Step 2.5
1. **Full-axis-set check — exact-set equality.** My default vote: assert `new Set(axes)` equals exactly the 5 `FinalJudgeAxis` members AND `axes.length === 5` (catches both a missing axis and a duplicate). The element-validity is already the schema's job; this adds completeness + no-dupes.
2. **Rubric source for MVP — frozen in-code const vs. a config file.** My default vote: a **frozen in-code `DEFAULT_JUDGE_RUBRIC` const** (committed, version-controlled — the strongest "never agent-writable" guarantee, since it's source not a runtime-writable file). The load function still validates it (defense-in-depth). A file-override path can come later; for MVP the const IS the immutable config. This directly satisfies "load from immutable config, never an agent-writable path."
3. **Re-assert `immutableToAgents` in the load path even though the schema's `literal(true)` enforces it?** My default vote: **yes** — the load path is the DOCUMENTED rule-#6 enforcement boundary (the carry-forward + the cross-doc row name it); a redundant explicit assert is cheap defense-in-depth and survives a future schema relaxation.
4. **Load+validate only, or also bind to scoring?** My default vote: **load+validate only** — return the validated `FinalJudgeRubric`; the judge RUNNER (P4.8) consumes it to produce the acceptance metric. Keeps this slice the pure anchor-load.

## Dependencies + sequencing
- **Depends on:** P0.15 `FinalJudgeRubric`/`FinalJudgeAxis` (frozen ✅); P4.1/P4.2 (adopted). The `validateRunConfig` pattern (P0.3, reference only). **No P3 dependency** — source injected.
- **Blocks:** P4.8 (held-out judge runner — consumes the validated rubric to score); the P3 boot layer (loads `DEFAULT_JUDGE_RUBRIC` at startup).

## Estimated commit count
**1.** Safety-invariant pin (key safety rule #6 — the held-out judge/rubric is immutable to agents, the
bedrock fitness anchor). **Solo — never bundled** (root `CLAUDE.md` TDD posture; the lead's bundle example
grouped rubric-load with council/judge, but the load-path is the rule-#6 enforcement point → solo, endorsed).

## Lessons-logged candidates anticipated
- **Convention candidate** — "the held-out-judge rubric LOAD path is the runtime enforcement of the two properties the immutable-anchor CONTRACT can't pin (lesson 17): full-axis-set completeness (exact 5-member set, no dupes) + `immutableToAgents:true` re-assert, loaded from a frozen in-code const (never an agent-writable path), pure-validate with a field-identifying boot error."
- **Architecture-doc note candidate** — §7/§14: name `loadJudgeRubric` + `DEFAULT_JUDGE_RUBRIC` as the concrete immutable-anchor load/enforcement point.
- **Future TODO (next-brief)** — P4.8 judge runner consumes the validated rubric; a rubric-file-override path (if ever) must keep the immutable-source guarantee.

## How to invoke
1. **Read this brief end-to-end** (session already oriented — no `/session-start`).
2. **Run `/tdd held_out_judge_rubric_load`.**
3. **Step 0 (Restate)** — confirm against the Feature line.
4. **Step 1 (Identify files)** — confirm against Files expected to touch (note the path-drift + adopt-not-new FYI).
5. **Step 2.5 (test review pause)** — answer the 4 design questions (or take defaults); ping the orchestrator. Don't go GREEN until signed off.
6. **Step 9 (summarize)** — surface anything beyond the anticipated lessons-logged candidates. **security-reviewer mandatory (rule #6 invariant slice).**
