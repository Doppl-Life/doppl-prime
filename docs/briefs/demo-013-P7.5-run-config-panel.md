# /tdd brief — run_config_panel

## Feature
The operator **run-config panel** (FROM the prototype's `ui_kits/run-launcher`): a form over `RunConfig`/`RunCaps` validated against the **shared Zod schema** before submit; **cap-max validation fail-closed at the browser seam** (a cap override above the validated ceiling is rejected client-side and never submitted — the demo override may only LOWER within maxima); both subtypes selectable (never all-disabled); Start issues the **idempotent `POST /runs`** and reflects the returned run identity (a duplicate submit doesn't create a second run — the API's idempotency is respected, not re-implemented); invalid settings surface inline accessible field-level errors and block submission.

## Use case + traceability
- **Task ID:** P7.5 (operator run-config panel with cap-max validation, fail-closed at the browser seam)
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (operator run-config panel), `§11` (idempotent `POST /runs`), `§14`/`§17` (cap-max validation at the Browser→API seam — fail-closed; the demo override only LOWERS caps within validated maxima, REQ-UX-004).
- **Related context:** key safety rules #2 (UI commands via REST; never mutates authoritative state directly) + #1-adjacent (the browser cap-max check is a DEFENSE/UX layer; the API P6.6 + the kernel are the authoritative enforcers — don't re-implement). **Builds on P7.1** (`runClient.startRun` = POST /runs, `38749ac`) + **P7.3** (tokens/accessible conventions, `65a988c`) + the prototype run-launcher. Consumes frozen `RunConfig`/`RunCaps` + `validateRunConfig` (P0.3) via the P7.1 `contracts.ts` seam. Design-touching (prototype in place). Unit-only (happy-dom + injected runClient).

## Acceptance criteria (what "done" means)
- [ ] The form edits the `RunConfig`/`RunCaps` fields (seed/rngSeed, enabledSubtypes[], the 6 caps, modelProfile, scoringPolicyVersion) and **validates against the shared Zod `RunConfig`** before submit
- [ ] **Cap-max fail-closed:** any cap override **above the validated ceiling is rejected client-side and never submitted** — the override may only LOWER within maxima; the UI never bypasses hard maximums (§14/§17)
- [ ] Both candidate subtypes are selectable and the panel **does not allow disabling all subtypes** (both subtypes equal must-ship)
- [ ] Start issues the **idempotent `POST /runs`** (via `runClient.startRun` with an idempotency key) and reflects the returned run identity; a duplicate submit does NOT create a second run (API idempotency respected, not re-implemented)
- [ ] Invalid settings produce **inline, accessible field-level errors** (a11y — programmatically associated) and block submission rather than failing silently
- [ ] Adherence-clean (var() tokens, no raw hex/px); no `apps/api` import (rule #9); no secret in client
- [ ] Unit tests pass (happy-dom + injected runClient); **count reported**; `/preflight` (web) clean

## Wiring / entry point (Step 7.5)
**none — mounted by the P7.14 shell.** P7.5 provides the `RunConfigPanel` + the form→RunConfig mapping/guard; the route mount (the run-launcher screen) wires in the P7.14 shell. Exercised now against an injected `runClient` (fake startRun). So: *first consumer — the P7.14 shell; Start calls the real `runClient.startRun` at integration.*

## Files expected to touch
**New:**
- `apps/web/src/components/run/RunConfigPanel.tsx` (or per the established layout — flag at 2.5; the prototype's analog is `ui_kits/run-launcher`) — the panel
- `apps/web/src/components/run/runConfigForm.ts` — form→RunConfig mapping + the cap-max (lowering-only) guard
- `apps/web/test/unit/components/run/RunConfigPanel.test.tsx` (+ unit for the pure form/guard)

**Modified:** none expected (consumes P7.1 runClient + P7.3 tokens + frozen contracts).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
**(happy-dom + injected runClient; `spec(§12)`/`spec(§11)`/`spec(§14)`):**
1. **`test_form_validates_against_shared_zod`** — a valid form maps to a `RunConfig` that passes the shared Zod; an invalid field is caught. *(Positive guard.)* Why: §12.
2. **`test_cap_over_ceiling_rejected_client_side`** — a cap above the ceiling is rejected + NOT submitted; a LOWERING within maxima submits. Why: §14/§17 fail-closed.
3. **`test_cannot_disable_all_subtypes`** — disabling both subtypes is blocked (both-equal must-ship). Why: §12.
4. **`test_start_issues_idempotent_post_runs`** — Start calls `runClient.startRun` (POST /runs) with an idempotency key; the panel reflects the returned run id; a duplicate submit doesn't start a second run. Why: §11 idempotency respected.
5. **`test_invalid_settings_inline_accessible_errors`** — invalid settings → inline field-level errors (programmatically associated), submission blocked. Why: §12 a11y.
6. **`test_no_apps_api_import`** — structural (rule #9, positive-guarded).

## Cross-doc invariant impact
- **Model field changes:** none (consumes frozen `RunConfig`/`RunCaps` read-only). **§2.5-seam:** none.
- **Orchestrator doc rows (Step 9):** likely none beyond apps/web §1–§3 (applies the conventions). I author hot if a new pattern surfaces.

## Things to flag at Step 2.5
1. **Cap-max ceiling source (client-side).** The browser needs the maxima to validate "lowering-only" against. My default vote: validate SHAPE via the shared Zod `RunConfig` (P0.3); for the cap-MAX ceiling, use the configured maxima (the run-config defaults) — source them from a client config/constant for MVP (mirroring the API's `defaultConfig.caps`), since there's no config-maxima endpoint yet; the **API (P6.6) is the authoritative enforcer** regardless (browser = defense/UX). Confirm the MVP ceiling source (client constant vs a fetch).
2. **Panel location.** My default vote: place per the established apps/web layout (`components/run/`), mirroring the prototype's run-launcher. Confirm (vs the tracker's `src/panels/`).
3. **Idempotency-key generation.** My default vote: the panel generates an idempotency key per submit attempt (stable across a retry of the same submit) so the API dedupes a double-click; don't re-implement the dedup. Confirm the key strategy.

## Dependencies + sequencing
- **Depends on:** **P7.1** (`runClient.startRun`, `38749ac`), **P7.3** (tokens, `65a988c`), the prototype (`7c0d34c`), frozen `RunConfig`/`RunCaps` (P0.3). Design-touching (prototype in place). Independent of apps/api.
- **Blocks:** P7.6 (stop control — sibling run-control), P7.14 (shell mounts it).

## Estimated commit count
**1.** Feature slice (the run-config panel + form guard). Not safety-invariant (the cap-max client check is a DEFENSE/UX layer; the API+kernel are authoritative). Step-8: code-quality phase-boundary; security-reviewer optional (no secret, no mutation beyond the contract POST).

## Lessons-logged candidates anticipated
- Likely none beyond apps/web §1–§3 (applies the prototype-port + adherence + a11y conventions). Possible: "the browser cap-max check is fail-closed DEFENSE/UX (lowering-only), never the authoritative enforcer (API+kernel); validate shape via the shared Zod, never re-implement the contract."

## How to invoke
> web session oriented — `/tdd`. cwd `apps/web/`. Stage only `apps/web/...`. Skim the prototype `ui_kits/run-launcher`.
1. **Run `/tdd run_config_panel`.**
2. **Step 2.5** — answer the 3 questions (esp. Q1 ceiling source), send the write-up + coverage map.
3. **Step 9** — surface anything beyond apps/web §1–§3.
