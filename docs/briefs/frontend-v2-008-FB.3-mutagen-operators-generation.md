# /tdd brief — mutagen_operators_shape_generation_framing

## Feature
Make `RunConfig.generationOperators` (FB.0's closed 7-member enum) **load-bearing**: the selected operator(s) map to **system-authored ideation-lens fragments** composed into the **TRUSTED generation framing** (the system message: `agenome.systemPrompt` + `GENERATION_ISOLATION_FRAMING` + the operator fragments) so they STEER how an agenome generates — `first_principles`, `breakthrough`, `polymath`, etc. The per-run PROBLEM stays isolated as untrusted DATA in the `wrapUntrusted` user message (PD.10, UNCHANGED — rule #5). `mergePerRunConfig` threads the per-run operators (today DROPPED, like `modelRouteOverride` pre-FB.2). Recorded as a generation input (`run.configured` already carries `generationOperators`, FB.0) so **replay reconstructs the identical framing with no provider call** (rule #7). **Caps/energy untouched (rule #1/#8 — an operator shapes the PROMPT, never a cap).**

> **RULE-#5 DESIGN (load-bearing — flagged to the human, Step-2.5 Q1).** A mutagen operator is an ideation STRATEGY meant to *steer* generation; the plan's literal "isolated DATA (data to evaluate, not instructions to follow)" would NEUTER it. The safe design: operator fragments are **TRUSTED framing** — the operator is a **CLOSED 7-member enum** selected by the operator, mapped to **SYSTEM-AUTHORED vetted fragments** (no untrusted free-text → no injection vector); the only variable is WHICH vetted fragment is chosen. The untrusted per-run problem stays `wrapUntrusted`-isolated. Rule #5 holds by construction. security-reviewer INVARIANT verifies it.

## Use case + traceability
- **Task ID:** FB.3
- **Architecture sections it implements:** `ARCHITECTURE.md §5` (runtime kernel — the generation loop assembly; caps/energy enforced separately from prompt content), `ARCHITECTURE.md §6` (model gateway — the population_generator call + structured output)
- **Related context:**
  - Phase plan: `docs/planning/frontend-v2-phase-plan.md` (FB.3 row — "Selected operator(s) shape the generation prompt as rule-#5 isolated DATA …; recorded as a generation input; caps/energy untouched (rule #1/#8) — an operator cannot raise a cap"). **The "isolated DATA" wording is reinterpreted per the rule-#5 design above** (trusted closed-enum framing; the untrusted problem stays isolated) — flagged to the lead/human.
  - **The assembly to extend (PD.10):** `apps/api/src/runtime/loop/generationLoop.ts:38–59` — `GENERATION_ISOLATION_FRAMING` (the fixed trusted framing) + the population_generator request: `messages: [{role:'system', content: `${systemPrompt}\n\n${GENERATION_ISOLATION_FRAMING}`}, {role:'user', content: wrapUntrusted(problem)}], schema: CandidateContent`. FB.3 adds the selected operators' fragments to the **system** message (trusted), NOT the user message.
  - **The thread to fix:** `apps/api/src/boot/composeRuntime.ts` `mergePerRunConfig` threads `seed`/`caps`/`enabledSubtypes`/`modelRouteOverride` but **drops `generationOperators`** — FB.3 threads it (mirrors the PD.10 `seed` thread + the FB.2 `modelRouteOverride` thread).
  - `GenerationOperator` enum (FB.0, `packages/contracts/src/run/generation-operator.ts`): breakthrough/first_principles/polymath/breakout/blindside/subtraction/constraint. `run.configured` persists `generationOperators` (FB.0) → replay reads it.
  - `wrapUntrusted` + `CRITIC_INPUT_SENTINEL` (frozen `@doppl/contracts`, the lesson-38 isolation chokepoint) — UNCHANGED; the operators do NOT go through it (they're trusted framing).
  - Safety: rule #5 (model output untrusted / candidate text is data — the operator mechanism must not create an injection path; it doesn't, being a closed enum of vetted fragments), rule #1 (caps kernel-enforced — an operator can't raise a cap), rule #8 (energy success-only — an operator doesn't change debit), rule #7 (replay reconstructs from the persisted operators, no provider call). **NOT rule #6** (operators steer GENERATION, never the held-out judge/scoring).

## Acceptance criteria (what "done" means)
- [ ] An **operator→fragment map** (NEW) maps each of the 7 `GenerationOperator` members to a **system-authored, non-empty ideation-lens fragment** (a trusted constant — short steering line); exhaustive over the closed enum.
- [ ] `generationLoop.ts` composes the **selected operators' fragments into the TRUSTED system message** (alongside `agenome.systemPrompt` + `GENERATION_ISOLATION_FRAMING`) via a **pure, deterministic assembly fn** (selected operators in the enum's canonical order — Step-2.5 Q2). The per-run problem **stays in the `wrapUntrusted` user message** (rule #5 isolation UNCHANGED — the operator fragments are NOT in the user message; the problem is NOT in the system message).
- [ ] **`mergePerRunConfig` threads `generationOperators`** (was dropped) so the generation loop receives the per-run operators (recorded == executed).
- [ ] **No operators (absent)** → the framing is byte-identical to PD.10 (backward-compatible — existing generation tests don't churn).
- [ ] **Deterministic / replay (rule #7):** the same operators → the same framing (pure fn); replay reconstructs the identical system message from the persisted `run.configured.generationOperators` with **no provider call** + no re-derivation divergence.
- [ ] **Caps/energy independence (rule #1/#8):** the operator assembly touches the **prompt only** — it does NOT read or change caps/energy; an operator cannot raise a cap (asserted) and doesn't alter energy debit.
- [ ] **Injection isolation (rule #5):** operators are a closed enum of vetted fragments (an out-of-enum value is rejected by the FB.0 schema — no free text reaches the prompt); the untrusted problem still can't escape `wrapUntrusted` (assert a malicious problem text still can't inject, AND an operator selection can't inject an instruction beyond its vetted fragment).
- [ ] No contract change (FB.0 shipped `generationOperators`; the fragment map + assembly are runtime). All apps/api tests pass; `/preflight` clean.
- [ ] **security-reviewer (INVARIANT):** rule #5 (no injection path via operators), rule #1 (no cap raise), rule #8 (energy unchanged) — run at Step 8 (the slice's safety core).

## Wiring / entry point (Step 7.5)
`apps/api/src/runtime/loop/generationLoop.ts` — the population_generator assembly (the system message gains the selected operators' fragments) + `apps/api/src/boot/composeRuntime.ts` `mergePerRunConfig` (threads `generationOperators` into the per-run config the loop executes). Confirm a run configured with operators actually produces a system message carrying the operator fragments (through the real loop assembly), and that replay reconstructs it from `run.configured`. The launcher operator-picker UI is **FV.3** (this is the runtime honoring).

## Files expected to touch
**New:**
- `apps/api/src/runtime/loop/generationOperators.ts` — the operator→fragment map + the pure `composeOperatorFraming(operators)` assembly fn (Step-2.5 Q3 — colocated with generationLoop)
- `apps/api/test/unit/runtime/loop/generationOperators.test.ts` (+ extend `generationLoop` / `composeRuntime` tests)

**Modified:**
- `apps/api/src/runtime/loop/generationLoop.ts` — compose the operator fragments into the trusted system message
- `apps/api/src/boot/composeRuntime.ts` — `mergePerRunConfig` threads `generationOperators`

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests in `apps/api/test/unit/runtime/loop/generationOperators.test.ts` (+ generationLoop/composeRuntime):

1. **`test_operator_fragment_map_exhaustive`** — Asserts: each of the 7 `GenerationOperator` members maps to a non-empty fragment; the map is exhaustive over the closed enum. Why: §5 + closed-enum completeness.
2. **`test_operators_compose_into_trusted_system_message`** — Asserts: selected operators' fragments appear in the SYSTEM message (with `systemPrompt` + `GENERATION_ISOLATION_FRAMING`), NOT the user message. Why: the rule-#5-safe design (operators = trusted framing).
3. **`test_problem_stays_isolated_in_user_message`** (rule #5) — Asserts: the per-run problem is in the `wrapUntrusted` USER message ONLY — never in the system message; the operator fragments are never in the user message. Why: rule #5 isolation unchanged (the two channels stay separate).
4. **`test_multiple_operators_deterministic_order`** — Asserts: 2+ selected operators concatenate in the enum's canonical order (deterministic, order-independent of the input array). Why: replay determinism (rule #7).
5. **`test_no_operators_framing_unchanged`** — Asserts: absent/empty operators → the system message is byte-identical to PD.10. Why: backward-compat.
6. **`test_merge_per_run_threads_operators`** — Asserts: `mergePerRunConfig` carries `generationOperators` into the per-run config (no longer dropped). Why: recorded == executed.
7. **`test_replay_reconstructs_framing_no_provider`** — Asserts: the same `run.configured.generationOperators` → the same system message; pure (no provider call, no re-sample). Why: rule #7.
8. **`test_operators_do_not_touch_caps_or_energy`** (rule #1/#8) — Asserts: the assembly reads/changes no caps/energy; an operator selection cannot raise a cap. Why: rule #1/#8 (an operator shapes the prompt only).
9. **`test_operator_injection_isolation`** (rule #5) — Asserts: an out-of-enum operator value is rejected by the FB.0 schema (no free text reaches the prompt); a malicious problem text still can't escape `wrapUntrusted` into the instruction. Why: rule #5 — operators add no injection path.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NONE — `generationOperators` shipped in FB.0; the fragment map + assembly are runtime. No schema-snapshot.
- **Orchestrator doc rows to write hot (Step 9 routing):** an `ARCHITECTURE.md §5/§6` note — operators map to system-authored fragments composed into the TRUSTED generation framing (closed-enum, no injection path — rule #5); threaded via `mergePerRunConfig`; replay-deterministic; caps/energy untouched. A `apps/api/LESSONS` convention candidate (operators = trusted closed-enum framing, NOT isolated-data; the problem stays isolated — the two-channel discipline). Orchestrator writes hot.
- **shared-contract seam model touched?** No.

## Things to flag at Step 2.5
1. **RULE-#5: operator fragments — TRUSTED framing vs isolated DATA (LOAD-BEARING, flagged to the human).** My default vote (and the design above): **TRUSTED framing** — operators are a closed 7-enum mapped to system-authored vetted fragments (no untrusted free-text → no injection vector), composed into the system message so they actually STEER generation; the untrusted problem stays `wrapUntrusted`-isolated. The literal "isolated DATA" reading would neuter the feature. This is flagged to the lead/human for ratification (the FB.2 rule-#6 pattern); security-reviewer INVARIANT independently verifies no injection path. If the human wants stricter isolation, the fallback is to present operators as a labeled-but-trusted section — discuss before GREEN.
2. **Multiple operators — compose order + cap.** My default vote: concatenate the selected fragments in the **enum's canonical order** (deterministic, replay-stable), regardless of the input-array order; no hard count cap in the runtime (FB.0's `.min(1)`-when-present; a sane max is a launcher concern).
3. **Where the fragment map + assembly live.** My default vote: a new `generationOperators.ts` colocated with `generationLoop.ts` (runtime/loop) — the map + the pure `composeOperatorFraming(operators)`.
4. **Fragment content + tone.** My default vote: short, vetted, system-authored lens lines (1–2 sentences each — e.g. `first_principles` → "Reason from first principles: decompose to fundamentals and ignore inherited convention."). They're trusted constants, tunable (not a contract); keep them generation-STEERING, never judge/scoring-referencing (rule #6 — operators never mention the judge/rubric).

## Dependencies + sequencing
- **Depends on:** FB.0 (`4bd2b4d`, `generationOperators` shape). PD.10's generation-isolation assembly (shipped). Backend-independent of FB.1/FB.2 (parallel-eligible, but same code area → serialize on the api impl).
- **Blocks:** FV.3 (launcher operator-picker) needs FB.0–FB.4; this is the "honor the selected operators" half.

## Estimated commit count
**1.** One coherent INVARIANT-bearing slice (the fragment map + the trusted-framing assembly + the thread). security-reviewed (rule #5 no-injection + rule #1/#8 caps/energy untouched are the core). Not a *solo* safety-invariant slice (that's FB.4) — but the rule-#5 design is the load-bearing pin. No contract change → the §5/§6 note + the lesson ride the round commit.

## Lessons-logged candidates anticipated
- **Convention candidate** — "mutagen operators are TRUSTED closed-enum framing (system-authored vetted fragments composed into the system message so they STEER generation), NOT isolated DATA (which would neuter them); rule #5 holds because the operator is a closed enum + the untrusted problem stays `wrapUntrusted`-isolated — the two channels (trusted instruction vs untrusted subject) stay strictly separate; threaded via `mergePerRunConfig`; replay-deterministic; caps/energy untouched."
- **Architecture-doc note candidate** — §5/§6: the operator→fragment trusted-framing mechanism + the two-channel isolation boundary.
- **Future TODO — operational** — tune the 7 fragment wordings post-demo; surface the operator set + descriptions via a read route for the FV.3 picker.
