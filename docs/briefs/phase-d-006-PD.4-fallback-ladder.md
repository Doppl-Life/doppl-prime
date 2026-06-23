# /tdd brief — fallback_ladder_controller

## Feature
The operator-driven three-rung demo **fallback ladder** (rung 1 low-cap live → rung 2 prepared known-good run → rung 3 labeled replay) as a PURE in-memory controller, plus a **demo cap-override** helper that produces a *lowered* `RunCaps` (only LOWERS, within validated maxima — never raises). Rungs advance ONLY on an explicit operator action (never auto-advanced); the controller exposes the active rung + its `live`/`replay` mode label and holds NO authoritative run state (switching rungs mutates nothing — each rung's run stays append-only in the log).

## Use case + traceability
- **Task ID:** PD.4
- **Architecture sections it implements:** `ARCHITECTURE.md §17` (deployment & demo — the operator-driven, rehearsed fallback ladder + "the demo override only lowers caps within validated maxima; the Browser→API cap-max validation still rejects any override above the ceiling"). Surfaces it composes (existing code, not re-implemented): §11 REST write path (`overCapField` cap-max rejection in `apps/api/src/routes/runs.ts`), §5 kernel cap enforcement (key safety rule #1), §4 `RunCaps`/`RunConfig` contracts.
- **Related context:** Phase-D round 1 (`phase-d-001` session doc) shipped the boot spine + `selectGateway`-env-switch + seed/replay pipeline. PD.4 is COLD (no prior brief). The cap-max authoritative backstop already exists: `overCapField(caps, maxima)` → `POST /runs` returns `422 cap_override_exceeds_max` when any cap > `defaultConfig.caps` (the boot ceiling, `= config.caps`). PD.4's `demo-cap-override` is a **convenience that produces a route-acceptable lowered config — it is NOT the authoritative enforcer** (the route + kernel remain authoritative, rule #1).

## Acceptance criteria (what "done" means)
- [ ] `applyDemoCapOverride(maxima, overrides)` returns a `RunCaps` where every overridden field is set to the (lower) override value and every non-overridden field stays at `maxima` — output validates against the frozen `RunCaps` schema.
- [ ] An override that would RAISE a cap (`override > maxima[field]`) is **rejected** with an explicit error naming the offending field — the helper can never emit a `RunCaps` with any field above `maxima` (the "override cannot raise caps" invariant, key safety rule #1).
- [ ] An override `== maxima[field]` is **accepted** (a no-op, not a raise) — the helper's boundary agrees EXACTLY with the route's `overCapField` (`> maxima` rejected, `≤ maxima` allowed); the two defense layers never disagree on the boundary.
- [ ] A non-positive override (`≤ 0`) is rejected (RunCaps fields are positive ints — an invalid cap can't be produced).
- [ ] `createFallbackLadder()` starts with the active rung = rung 1 (`low-cap-live`, mode `live`).
- [ ] Rungs advance ONLY on an explicit operator call (`select(rung)` / `advance()`) — there is no timer, no event subscription, no auto-fallback; the controller is inert between operator calls (manual stage timing, §17).
- [ ] The operator can select any rung directly (e.g. live failed → jump straight to rung 3 replay), not only forward-step.
- [ ] Each rung exposes a descriptor: rung 1 `{kind:'low-cap-live', mode:'live', caps:<lowered>}`; rung 2 `{kind:'prepared', mode:'live', runConfig:<prepared>}`; rung 3 `{kind:'replay', mode:'replay', replayRunId:<recorded>}` — rung 3's mode is unambiguously `replay` (labeled).
- [ ] Selecting/switching rungs performs ZERO authoritative writes and never mutates a prior rung's run (the controller holds only the in-memory active-rung selection; prior runs stay append-only/replayable).
- [ ] Rung 1's descriptor caps are produced via `applyDemoCapOverride` (the two modules compose) and are route-acceptable (≤ maxima).
- [ ] Integration: `POST /runs` with a cap above `defaultConfig.caps` still returns `422 cap_override_exceeds_max` (the authoritative backstop PD.4's helper defends — defense-in-depth, reached through the real route + real Postgres event store).
- [ ] Integration: a lowered-cap `RunConfig` built from `applyDemoCapOverride` is accepted by `POST /runs` (appends exactly one `run.configured`) — the helper's output flows cleanly through the same write path.
- [ ] All unit tests in `apps/api/test/unit/runtime/demo/` pass; integration in `apps/api/test/integration/runtime/demo/` (or `routes/`) passes.
- [ ] `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none (production write-path + UI wiring) — lands in PD.5 + PD.6.** PD.4 ships two PURE backend modules. Their production consumers are the next Phase-D slices (same phase, so reachable by `/phase-exit PD`):
- `applyDemoCapOverride` → consumed by **PD.5** `demo-run-config.ts`, which builds the rung-1 lowered-cap `RunConfig` and starts it through the existing `POST /runs` write path (no bypass).
- `createFallbackLadder` active-rung + mode → consumed by **PD.6** `ModeIndicator.tsx` (live vs replay) + the operator surface; rung 3's `replayRunId` is served by the existing `GET /runs/:id/replay` reader.
- Exercised end-to-end by **PD.8** rehearsals (fallback-ladder rehearsal walks all three rungs in operator-driven order).

This slice's own reachability into production is the **integration test through the real `POST /runs` route** (the cap-max backstop assertion), which proves the helper's output is route-valid today. The controller's operator/UI wiring is genuinely PD.5/PD.6 work (those tasks `Depends on: PD.4`).

## Files expected to touch
**New:**
- `apps/api/src/runtime/demo/demo-cap-override.ts` — `applyDemoCapOverride(maxima: RunCaps, overrides: Partial<RunCaps>): RunCaps` — only-lowers, rejects-raise, validates output.
- `apps/api/src/runtime/demo/fallback-ladder.ts` — `createFallbackLadder(config): FallbackLadder` — the in-memory operator controller (active rung, manual `select`/`advance`, per-rung descriptor, `mode`), the `DemoRung`/`RungDescriptor` types.
- `apps/api/src/runtime/demo/index.ts` — barrel for the demo module (re-exports the two above).
- `apps/api/test/unit/runtime/demo/demo-cap-override.test.ts`
- `apps/api/test/unit/runtime/demo/fallback-ladder.test.ts`
- `apps/api/test/integration/runtime/demo/cap-override-write-path.test.ts` — the route cap-max backstop + lowered-config-accepted assertions (real route + real Postgres).

**Modified:**
- *(none expected)* — if the controller needs a small type from an existing module, flag at Step 2.5 before GREEN. Do NOT touch `routes/runs.ts` (the authoritative cap-max check already exists — PD.4 only ASSERTS it from the integration test, never edits it).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

`apps/api/test/unit/runtime/demo/demo-cap-override.test.ts`:
1. **`lowers_each_overridden_cap`** — override below maxima → result field == override; unspecified fields == maxima.
   - Asserts: each `overrides` key lowered; absent keys unchanged; result deep-equals expected `RunCaps`.
   - Why: §17 "override only lowers caps within validated maxima."
2. **`rejects_override_that_raises_a_cap`** — `override[field] > maxima[field]` throws, error names the field; no `RunCaps` returned.
   - Asserts: throw; message includes the field name; never returns an above-ceiling cap.
   - Why: §17 + key safety rule #1 (override cannot raise caps).
3. **`accepts_override_equal_to_ceiling`** — `override[field] == maxima[field]` accepted (no-op), result == maxima for that field.
   - Asserts: no throw; boundary matches the route's `overCapField` (`> maxima` rejected only).
   - Why: §17 boundary parity (defense layers agree).
4. **`rejects_non_positive_override`** — `override[field] ≤ 0` throws.
   - Asserts: throw; no invalid `RunCaps` emitted (positive-int contract).
   - Why: §4 `RunCaps` (positive ints).
5. **`output_validates_as_RunCaps`** — `RunCaps.parse(result)` succeeds for a valid lowering.
   - Asserts: `safeParse(result).success === true`.
   - Why: §4 — the helper emits a valid frozen contract object.

`apps/api/test/unit/runtime/demo/fallback-ladder.test.ts`:
6. **`starts_at_rung_1_live`** — fresh ladder → active rung is `low-cap-live`, mode `live`.
   - Asserts: `ladder.active().kind === 'low-cap-live'` && `mode === 'live'`.
   - Why: §17 ladder rung order.
7. **`advance_steps_1_to_2_to_3`** — operator `advance()` walks low-cap-live → prepared (mode live) → replay (mode replay).
   - Asserts: sequence of `active().kind`/`mode` after each `advance()`.
   - Why: §17 three-rung order; rung 3 replay mode.
8. **`manual_only_no_auto_advance`** — after construction with no operator call, the active rung never changes (no timer/subscription); a second read returns rung 1.
   - Asserts: active rung stable across reads without a `select`/`advance`; controller exposes no auto-transition seam.
   - Why: §17 "manual (not auto) so the operator controls stage timing."
9. **`operator_can_jump_to_any_rung`** — from rung 1, `select('replay')` makes rung 3 active directly.
   - Asserts: `ladder.select('replay'); active().kind === 'replay'`.
   - Why: §17 operator-driven (live-fail → straight to replay).
10. **`switch_does_not_mutate_prior_rung`** — switching rungs performs no authoritative write (inject a spy event-store / assert the controller takes no store dep, or asserts no append occurs); prior rung's descriptor unchanged.
    - Asserts: no event appended on `select`/`advance`; the controller has no write capability.
    - Why: acceptance — "switching never mutates authoritative state of a prior rung's run"; rule #2.
11. **`rung_1_caps_are_lowered_via_override`** — rung-1 descriptor caps == `applyDemoCapOverride(maxima, demoOverrides)` and are ≤ maxima.
    - Asserts: descriptor caps deep-equal the override result; `overCapField(caps, maxima) === null`.
    - Why: §17 — modules compose; rung 1 is route-acceptable.

`apps/api/test/integration/runtime/demo/cap-override-write-path.test.ts` (real route + real Postgres):
12. **`route_rejects_above_ceiling_override`** — `POST /runs` with `caps.maxGenerations > defaultConfig.caps.maxGenerations` → `422 cap_override_exceeds_max`, field named; NO `run.configured` appended.
    - Asserts: 422 + `field`; the event log has zero `run.configured` for that attempt.
    - Why: §17/§11 — the authoritative backstop PD.4 defends (override cannot raise caps), defense-in-depth.
13. **`lowered_override_config_is_accepted`** — a `RunConfig` whose caps come from `applyDemoCapOverride` POSTs → `201`, exactly one `run.configured` appended with the lowered caps.
    - Asserts: 201 `{runId}`; the appended `run.configured.payload.caps` == the lowered caps.
    - Why: §17 — rung-1/rung-2 "started from the same write path as a normal run (no bypass)."

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none. PD.4 uses the existing frozen `RunCaps` / `RunConfig` (Appendix A) — ZERO new contract surface (no new `RunEventType`, no new Appendix-A model). Confirms the PD acceptance "Demo introduces NO new contract surface."
- **Orchestrator doc rows to write hot (Step 9 routing):** none expected (crossDocInvariant: none). A likely **Architecture-doc note** (§17 prose): the fallback ladder is a pure in-memory operator controller (manual advance, no auto-fallback, holds no authoritative state); the demo cap-override only lowers and shares the `> maxima` boundary with the route. Routed to phase-d's `ARCHITECTURE.md` copy (cody reconcile at phase-end merge).
- **§2.5-seam (shared-contract) model touched?** No — no Appendix-A model defined/changed; no schema-snapshot test required (matches PD acceptance "no seamSnapshot is required").

## Things to flag at Step 2.5
1. **Above-ceiling override: reject vs clamp-to-ceiling?** Reject (throw, naming the field) OR silently clamp down to the ceiling. My default vote: **reject** — fail-loud, mirrors the route's `422`, and a silently-clamped fat-fingered demo number would mislead the operator into thinking they lowered a cap they didn't. (The route remains the authoritative backstop either way.)
2. **`== ceiling` boundary: accept or reject?** Accept as a no-op (reject only strictly `>`) OR reject equal-to-ceiling as "not a lowering." My default vote: **accept (`≤` allowed, only `>` rejected)** — exact parity with the route's `overCapField` so the two defense layers never disagree on the boundary.
3. **Controller shape: in-memory stateful registry vs pure descriptor factory?** My default vote: **a small in-memory controller** (`createFallbackLadder(cfg) → {active, select, advance, descriptorFor}`), mirroring `createOperatorStopRegistry` — it tracks ONLY the active-rung selection, takes no event-store/write dependency, and is inert between operator calls (so "no auto-advance" + "no prior-state mutation" are structural, not just untested).
4. **Does the controller produce a `RunConfig`/start runs, or only descriptors?** My default vote: **descriptors only** (rung 1 carries lowered caps, rung 2 a prepared `RunConfig`, rung 3 a `replayRunId`); it does NOT call `POST /runs` or the replay reader — that wiring is PD.5/PD.6. Keeps PD.4 pure + unit-testable and avoids touching the write path.
5. **Rung/mode naming.** My default vote: `type DemoRung = 'low-cap-live' | 'prepared' | 'replay'` and `mode: 'live' | 'replay'` — string unions (no enum), so descriptors are plain serializable data PD.6's UI can consume directly.
6. **Carry-forward (a)/(b) — orchestrator+lead resolved: NOT folded into the controller.** (a) `OpenRouter→selectGateway` (the live rung's real execution): "fold if clean" was assessed NOT clean — it's a cross-area model-gateway composition (OpenRouter `providerCall` adapter + registry route resolution + `assertProviderCredentials` credential boundary) with its own design questions, and folding it would muddy the rule-#1 safety property this slice isolates. So it stays a SEPARATE slice (lands with/before PD.5's live path). PD.4's rung-1 ALREADY enforces low caps via `applyDemoCapOverride` (cost-bound) **regardless of whether the live gateway is wired** — keep the recorded-default / `DOPPL_GATEWAY=live` opt-in / honest-throw-on-absent-creds posture. (b) Multi-fixture: the controller **config accepts distinct prepared + replay runIds** (ready for a catalog), but the actual multi-fixture SEEDING is cross-area (`event-store/scripts/seed-demo.ts`) and lands with PD.8's real-fixture capture — the controller only REFERENCES the runIds, it doesn't seed. My default vote: **controller takes runIds as config; no gateway/seeding code in this slice.**

## Dependencies + sequencing
- **Depends on:** PD.2 (a seeded recorded run exists for rung 3 to reference — the controller only holds the `replayRunId`, doesn't seed it). Existing: `overCapField` + `POST /runs` write path (round 1), frozen `RunCaps`/`RunConfig`.
- **Blocks:** PD.5 (consumes `applyDemoCapOverride` for the live-prompt run-config + write-path start), PD.6 (consumes the active-rung/mode for the indicator + health surfacing), PD.8 (fallback-ladder rehearsal).
- **Adjacent (NOT folded):** carry-forward (a) OpenRouter→`selectGateway` (gates rung-1 live execution; separate model-gateway slice), (b) multi-fixture seeding (separate event-store-scripts slice).

## Estimated commit count
**2 (lead-directed safety isolation).** The cap-override pins key safety rule #1 ("caps cannot be raised"), so it gets its OWN commit, NOT bundled with the ladder feature:
- **Commit 1 — `demo-cap-override` (SAFETY, own commit):** `demo-cap-override.ts` + `demo-cap-override.test.ts` + the integration `cap-override-write-path.test.ts` (the route `422` backstop + lowered-config-accepted). Tested HARD: every raise attempt rejected; the helper can never emit a cap above maxima. Security-reviewer = **invariant**. Frame it as **defense-in-depth operator-input validation that DEFERS to the authoritative kernel/route clamp (rule #1) — never a second cap authority**.
- **Commit 2 — `fallback-ladder` (FEATURE):** `fallback-ladder.ts` + `index.ts` + `fallback-ladder.test.ts`, consuming `applyDemoCapOverride` for rung-1 caps.

Both ride one `/tdd` cycle / one Step-2.5 review (same `runtime/demo/` context), but land as two commits so the safety property is isolated + bisectable. NOT bundled with carry-forward (a)/(b) (cross-area — see Dependencies).

## Lessons-logged candidates anticipated
- **Convention candidate** — "A demo/convenience cap-override only LOWERS and shares the exact `> maxima` boundary with the authoritative route check (`overCapField`); the two defense layers must agree on the boundary, and the route/kernel stay the authoritative enforcer (rule #1) — the helper is never trusted alone."
- **Architecture-doc note candidate** — §17: the fallback ladder is a pure in-memory operator controller (manual advance, no auto-fallback timer, no authoritative state, switching mutates nothing); rung descriptors are plain serializable data the UI consumes.
- **Future TODO — operational** — rung-1 live execution needs `OpenRouter→selectGateway` (carry-forward (a)); prepared/replay rung sources want a multi-fixture catalog (carry-forward (b)).

## How to invoke
1. **Read this brief end-to-end** — especially "Things to flag at Step 2.5" (6 design questions, pre-voted).
2. **Run `/tdd fallback_ladder_controller`** in the implementer session.
3. **Step 0 (Restate)** — confirm the restatement matches the Feature line (a PURE controller + cap-override helper; wiring is PD.5/PD.6).
4. **Step 1 (Identify files)** — confirm against "Files expected to touch" (new `runtime/demo/` module; do NOT edit `routes/runs.ts`).
5. **Step 2.5** — send the test-design write-up (one `Asserts:` line/test + the acceptance→test coverage map) + answers to the 6 design questions (or take defaults).
6. **Step 9** — surface anything beyond the anticipated lessons-logged candidates.

> **CWD — CRITICAL (the Bash cwd RESETS to the lead's root each call; `cd` is not a persistent guard):**
> - Read/Edit/Write → ABSOLUTE paths under `/Users/dreddy/Documents/GauntletAI/Capstone-phased/`.
> - TESTS / pnpm / drizzle (cwd-sensitive!) → `pnpm -C /Users/dreddy/Documents/GauntletAI/Capstone-phased/apps/api test ...` OR a single-call compound `cd /Users/dreddy/Documents/GauntletAI/Capstone-phased/apps/api && pnpm test ...`. A bare `pnpm test` from the reset cwd runs the KERNEL worktree's suite = FALSE GREEN on the wrong code.
> - git → `git -C /Users/dreddy/Documents/GauntletAI/Capstone-phased ...`.
> - Branch-check gate before the first edit AND before the Step-10 commit: `git -C /Users/dreddy/Documents/GauntletAI/Capstone-phased branch --show-current` must print `phase-d`.
