# /tdd brief — operation_start_markers_amendment

## Feature
**AMEND the Phase-0 freeze (user-decided, before the kernel forks):** add the 11 **operation-start / in-flight observability markers** to the closed `RunEventType` enum and bump `CURRENT_SCHEMA_VERSION` 1→2. Markers: `generation.verifying`, `generation.scoring`, `generation.reproducing`, `candidate.generation_started`, `critic.review_started`, `check.started`, `novelty.scoring_started`, `judge.review_started`, `fusion.started`, `tool_call.started`, `tool_call.finished` (25→36 members). `RunEventType` stays a CLOSED union rejecting unlisted types. Markers are **persisted + replay-faithful** (the envelope already carries their `run/generation/agenome/candidate` correlation IDs; no provider call to replay) and **debit NO energy** (rule #8 — they are NOT `energy.spent`; only the underlying op's success debits). **INVARIANT-TOUCHING** (closed-union closure RISK-006 + energy semantics rule #8 + schemaVersion). SOLO — own commit, never bundled; security-reviewer at Step 8.

## Use case + traceability
- **Task ID:** P0.1-amend (re-opens the P0.1 `RunEventType` criterion — see the rewritten criterion under Phase 0)
- **Architecture sections it implements:** `ARCHITECTURE.md §4` (the new "Live in-flight observability — operation-start markers" paragraph + the Appendix-A `RunEventType` row, both already authored into this worktree), §11 (SSE + health carry markers), §12 (real-time in-flight window), §13 (events are the live window). The downstream emit requirements are now per-phase bullets in P3/P4/P5/P6/P7 (kernel/verifier/selection/demo tracks — NOT this slice; this slice only freezes the contract).
- **Related context:** This corrects the freeze BEFORE the kernel forks — forking from a freeze the plan already contradicts would force a post-fork schemaVersion bump + a cross-track Finding. The orchestrator has already authored the spec into `ARCHITECTURE.md` + `IMPLEMENTATION_PLAN.md` (so spec-lint + the snapshot check against the right spec); the integration-checkout (cody) copies are the lead's to reconcile at merge. Reuses lesson §1 (closed enum pinned reject-out-of-set + member-set snapshot), lesson §15 (payload-map own-property resolver fail-open to generic for non-high-traffic types). `CURRENT_SCHEMA_VERSION` lives in `src/version.ts`; `RunEventType` in `src/events/event-type.ts`.

## Acceptance criteria (what "done" means)
- [ ] `RunEventType` (`src/events/event-type.ts`) is the CLOSED enum with EXACTLY the prior 25 members PLUS the 11 markers (36 total): `generation.verifying`, `generation.scoring`, `generation.reproducing`, `candidate.generation_started`, `critic.review_started`, `check.started`, `novelty.scoring_started`, `judge.review_started`, `fusion.started`, `tool_call.started`, `tool_call.finished`. Each of the 36 parses; any unlisted value (e.g. `'generation.idle'`, `''`) is rejected (closure preserved, RISK-006).
- [ ] `CURRENT_SCHEMA_VERSION` (`src/version.ts`) is bumped to **2** (was 1); pinned by a literal-value assertion (`=== 2`) so the bump is deliberate + snapshot-caught.
- [ ] **Markers fall back to the generic payload** (Q1): no new `HIGH_TRAFFIC_PAYLOAD_MAP` entries — `resolvePayloadSchema('check.started')` (and the other 10 markers) returns `GENERIC_PAYLOAD_SCHEMA` (correlation is envelope-level; markers carry no rich/narrowed payload). The 6 high-traffic narrowings are unchanged.
- [ ] **No-energy-debit preserved (rule #8):** the markers are distinct `RunEventType` members from `energy.spent`; no marker is mapped to `EnergyEvent` and no marker payload carries an energy/estimate/actual field (generic payload, runtime emits without ledger debit — pinned structurally by the markers NOT being `energy.spent` / not narrowing to `EnergyEvent`).
- [ ] **Schema-snapshot updated (§2.5 gate, tagged `spec(§4)`):** the `RunEventType` member-set snapshot (`field-sets.test.ts` `EVENT_TYPE_SNAPSHOT`→36 + `event-type.test.ts` REGISTRY→36; the P0.14 `contract-surface.test.ts` sweep needs NO change — it pins the 17-union count + a representative valid/invalid pair, both still hold) equals the new frozen set; adding/removing/renaming a marker is caught as a cross-track regression.
- [ ] **Fixtures re-recorded:** the canonical `validRunEventEnvelope` fixture (+ any fixture asserting `schemaVersion`) reflects `schemaVersion: CURRENT_SCHEMA_VERSION` (= 2); existing `schemaVersion ≤ current` reader behavior is preserved (a `schemaVersion: 1` envelope still validates). `CANONICAL_FIXTURES` still validates (P0.14 sweep green).
- [ ] All unit + contract tests pass (incl. the full P0.14 surface); `/preflight` clean (package-pinned prettier — lesson §14).

## Wiring / entry point (Step 7.5)
Entry point = the `@doppl/contracts` barrel re-exports the (extended) `RunEventType` + the (bumped) `CURRENT_SCHEMA_VERSION`. The markers' runtime emit (kernel generation-phase markers P3, critic/check/judge markers P4, novelty/fusion markers P5, health/SSE surfacing P6, dashboard in-flight rendering P7) lands in the downstream tracks per the per-phase emit bullets now in the plan. `none — runtime emit + SSE/health/dashboard wiring lands in P3–P7 by design`. Reachability = barrel-exported + member-set snapshot + closed-union sweep + fixture validation.

## Files expected to touch
**Modified:**
- `packages/contracts/src/events/event-type.ts` — add the 11 markers to the `z.enum` (CLOSED).
- `packages/contracts/src/version.ts` — `CURRENT_SCHEMA_VERSION` 1→2.
- `packages/contracts/test/__schema-snapshots__/field-sets.test.ts` (the P0.1 envelope/RunEventType snapshot) — update the `RunEventType` member-set snapshot.
- _(Corrected post-Step-2.5: `contract-surface.test.ts` needs NO change — its `UNION_SWEEP` uses a representative `{valid:'run.started', invalid:'run.exploded'}` pair + a 17-**UNION** count-pin (`toHaveLength(17)`), NOT a RunEventType member count, so both hold after the amendment. The 25→36 member pin lives in `event-type.test.ts` REGISTRY + `field-sets.test.ts` `EVENT_TYPE_SNAPSHOT`. Implementer caught the brief's union-count↔member-count conflation.)_
- `packages/contracts/src/test-fixtures/index.ts` — re-record `validRunEventEnvelope` (`schemaVersion: 2`) + any version-dependent fixture.
- `packages/contracts/test/events/event-type.test.ts` (+ `payload-map.test.ts`, `version.test.ts` if present) — markers parse / out-of-set rejected / markers→generic fallback / `CURRENT_SCHEMA_VERSION === 2`.

If a snapshot/fixture lives in a different file than expected, **flag at Step 2.5** before going GREEN. (No NEW files expected — this is an amendment.)

## RED test outline (Step 2)
1. **`run_event_type_accepts_36_incl_markers`** *(spec §4)* — Asserts (positive-guard-first): all 11 markers parse via `RunEventType`; the prior 25 still parse. Why: §4 registry extended, closure preserved.
2. **`run_event_type_still_rejects_out_of_set`** *(spec §4, RISK-006)* — Asserts: `'generation.idle'` / `'tool_call.aborted'` / `''` rejected. Why: still a CLOSED union after the amendment.
3. **`markers_resolve_to_generic_payload`** *(spec §4, lesson §15)* — Asserts: `resolvePayloadSchema(<each marker>)` returns `GENERIC_PAYLOAD_SCHEMA`; the 6 high-traffic narrowings are unchanged. Why: markers carry envelope-level correlation, no narrowed payload (Q1).
4. **`markers_are_not_energy_spent`** *(spec §4, rule #8)* — Asserts: no marker maps to `EnergyEvent` in `HIGH_TRAFFIC_PAYLOAD_MAP`; `energy.spent` remains the only `EnergyEvent`-narrowed type. Why: markers debit no energy (distinct from `energy.spent`).
5. **`current_schema_version_is_2`** *(spec §4)* — Asserts: `CURRENT_SCHEMA_VERSION === 2` (literal). Why: deliberate, snapshot-caught bump.
6. **`envelope_accepts_old_and_new_schema_version`** *(spec §4)* — Asserts: an envelope with `schemaVersion: 1` AND one with `schemaVersion: 2` both parse (the contract carries no ≤-current reader logic — that's P1 — but `schemaVersion` is a positive int, so both are structurally valid; the canonical fixture uses 2). Why: the bump doesn't break old-version validation at the contract level.
7. **`schema_snapshot_run_event_type_36`** *(spec §4/§2.5)* — Asserts: the `RunEventType` member-set snapshot (`EVENT_TYPE_SNAPSHOT`) == the new 36-member frozen set + its length-pin == 36 (the P0.14 17-union sweep is unchanged). Why: §2.5 cross-track regression gate (a dropped/renamed marker breaks the gate).
8. **`canonical_fixtures_still_valid_at_v2`** *(spec §16)* — Asserts: `validRunEventEnvelope.schemaVersion === 2` and the full `CANONICAL_FIXTURES` sweep stays green. Why: fixtures re-recorded; P0.14 surface intact.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** `RunEventType` extended (25→36 members) + `CURRENT_SCHEMA_VERSION` 1→2. No OTHER model shape changes.
- **§2.5-seam model touched?** **YES** — `RunEventType` is the frozen event registry. RED outline MUST update the member-set snapshot (#7).
- **Orchestrator doc rows already written (verify):** the orchestrator has ALREADY authored — `ARCHITECTURE.md` §4 observability paragraph + §11/§12/§13 + the Appendix-A `RunEventType` row (markers appended) + the `apps/api/CLAUDE.md` `RunEventType` cross-doc row note + the per-phase emit bullets + the re-opened P0.1 criterion. At Step 9, confirm the `apps/api/CLAUDE.md` `RunEventType` row reflects "36 members incl. 11 operation-start markers + schemaVersion 2" (the orchestrator finalizes it). **Safety-relevant:** any breaking of closure (an unlisted value parsing), any marker debiting energy, or any marker narrowing to a rich payload that could carry secrets is a Step-9 **Finding**.

## Things to flag at Step 2.5
1. **Marker payloads — generic fallback (default) vs narrowed.** My default vote: **generic fallback** — markers carry `run/generation/agenome/candidate` correlation at the ENVELOPE level (§4), so the payload is minimal/empty; no `HIGH_TRAFFIC_PAYLOAD_MAP` entry. Flag if `tool_call.started`/`tool_call.finished` should carry a narrowed payload (tool name / args summary / duration) now — I lean generic for MVP (narrow later when the gateway wiring lands in P2/P3; keep this slice contract-only). Whatever lands, no secret/credential field (a tool-call payload would route through `scrubSecrets` at persistence anyway).
2. **schemaVersion bump pin.** My default vote: `CURRENT_SCHEMA_VERSION = 2` + a literal `=== 2` test. Confirm there's no OTHER place hardcoding `1` (grep for a stray `schemaVersion: 1` outside fixtures + the ≤-current note).
3. **Enum ordering / grouping.** My default vote: append the 11 markers to the `z.enum` array (a grouped comment block "// operation-start / in-flight markers"), order them as listed; the snapshot pins the SET not the order. Confirm the snapshot compares as a set (sorted) so ordering isn't load-bearing.
4. **Member-set snapshot location(s).** My default vote: update BOTH the P0.1 `field-sets.test.ts` RunEventType snapshot AND the P0.14 `contract-surface.test.ts` sweep (length-pin 25→36). Confirm there's no third place pinning the 25-count.
5. **Commit type.** My default vote: **`feat(contracts): operation-start markers on RunEventType + schemaVersion 2 (P0.1-amend)`** — 1 SOLO commit. Not a `!`-breaking change (readers accept `schemaVersion ≤ current`; old envelopes still validate). Flag if you'd rather mark it breaking.

## Dependencies + sequencing
- **Depends on:** the frozen P0 contracts (event-type.ts, version.ts, payload-map.ts, the P0.14 surface) — all landed at `bab92e1`.
- **Blocks:** the **kernel track fork** (P1+) — this re-seal is the corrected freeze the four tracks fork from. After this lands → re-run `/phase-exit P0` + re-seal + push; the lead then merges track/contract→cody + spins up the kernel worktree.

## Estimated commit count
**1** — SOLO, invariant-touching amendment (closed-union closure RISK-006 + energy semantics rule #8 + schemaVersion). One cohesive commit. Never bundled.

## Step-8 reviewer policy
**security-reviewer: FAN OUT** — invariant slice (lead-mandated). Review surface: confirm (a) `RunEventType` closure holds (no unlisted value parses) after adding 11 members, (b) no marker debits energy / maps to `EnergyEvent` (rule #8), (c) markers fall back to generic payload (no rich payload that could smuggle a secret past the envelope; `scrubSecrets` still covers any payload at persistence), (d) the schemaVersion bump is deliberate + snapshot-pinned, (e) old-`schemaVersion` envelopes still validate (no accidental reader-break). `code-quality-reviewer`: phase-boundary (folds into the re-run `/phase-exit`).

## Lessons-logged candidates anticipated
- **Convention candidate** — possibly "extending a frozen closed union is a schemaVersion bump + a member-set-snapshot update + fixture re-record, done as a SOLO invariant amendment BEFORE downstream forks" (amending-a-freeze playbook). Likely a short note, your call at Step 9.
- **Architecture-doc note** — already authored (the §4 observability paragraph + Appendix-A row); confirm at Step 9.

## How to invoke
1. **Read this brief end-to-end.** Q1 (generic-vs-narrowed marker payloads) is the load-bearing call; the schemaVersion bump + closure-preservation are the invariant pins.
2. **Run `/tdd operation_start_markers_amendment`.**
3. **Step 0/1** — confirm restatement + file list; confirm this is an AMENDMENT (no new model files; extends `RunEventType` + bumps `CURRENT_SCHEMA_VERSION`) and that the spec is already in `ARCHITECTURE.md`/`IMPLEMENTATION_PLAN.md`.
4. **Step 2.5** — send the test-design write-up (per-test `Asserts` + per-acceptance-bullet coverage map) + answers. Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 7→8** — security-reviewer fans out (invariant slice).
6. **Step 9** — categorized flags + ship-ask; any closure break / energy-debit / secret-smuggle is a Finding. After it lands I re-run `/phase-exit P0` + re-seal.
