# /tdd brief — boot_config_loader

## Feature
The single boot-config entry point: load + Zod-validate every config source (model registry, scoring policy, RunCaps defaults, demo problem sets) with **fail-fast at boot**, resolve **defaults < file < env** precedence deterministically, fail-fast-check required env (provider keys + DB URL), keep credentials **env-only and never echoed in validation errors** (rule #4), and expose a single **validated, immutable** `AppConfig` the kernel consumes (downstream cannot mutate). Composes the existing canonical validators (`validateRunConfig` P0.3, `loadModelRegistry` + `assertProviderCredentials` P2.2) rather than reinventing parsing.

## Use case + traceability
- **Task ID:** P3.1
- **Architecture sections it implements:** `ARCHITECTURE.md §5` (runtime kernel — boot/config), §15 (config/env precedence + fail-fast), §14 (security — credentials env-only, never in a persisted/logged object or echoed in errors).
- **Consumed (landed, not re-implemented):** `validateRunConfig` (P0.3, `packages/contracts/src/config/validate.ts`) · `loadModelRegistry` + `assertProviderCredentials` (P2.2, `apps/api/src/model-gateway/registry.ts`) · `RunCaps`/`RunConfig` (frozen P0.3) · `ScoringPolicy` (frozen P0.8) · `RegistryConfig` (P2.2 `config.schema.ts`).
- **Carry-forwards folded in (from the routing ledger §C + predecessor):**
  - **`validateRunConfig` is THE canonical boot-config entry** — P3.1 MUST call it (read file/env → `validateRunConfig({defaults,file,env})` → start-or-exit), not reinvent config parsing (origin: P0.3).
  - **single-source `deepMerge`** — P3.1's boot-config is the **2nd in-track consumer** of the `defaults<file<env` merge (the 1st is P2.2 `model-gateway/config.schema.ts`, which currently mirrors it locally). Per lesson 27/§4, a 2nd in-track consumer is the trigger to single-source it. See Step-2.5 Q1.
  - **`assertProviderCredentials` first** — the env fail-fast leg is exactly `assertProviderCredentials(env)` (P2.2), extended with the DB URL (already in its required set: `[OPENROUTER_API_KEY, OPENAI_API_KEY, DATABASE_URL]`).

## Acceptance criteria (what "done" means)
- [ ] `loadConfig({ env, fileSources })` returns a single validated `AppConfig` composing: the validated `RunConfig` (via `validateRunConfig`), the `RegistryConfig` (via `loadModelRegistry`), the `ScoringPolicy`, the `RunCaps` defaults, and the demo problem sets — each parsed through its Zod schema at startup.
- [ ] **Fail-fast on any schema violation:** an invalid config source aborts boot with a clear, **field-pointing** error (the offending `path` + Zod `code`), never a partial/degraded start.
- [ ] **Required env fail-fast:** `loadConfig` calls `assertProviderCredentials(env)` (provider keys + DB URL); a missing/blank required var aborts boot with a **named** error identifying the var (not its value).
- [ ] **Precedence `defaults < file < env`** resolves deterministically for every overridable key (env overrides file overrides built-in defaults), via the single-sourced `deepMerge` discipline (deep-merge plain objects / replace arrays+scalars / skip `__proto__`/`constructor`/`prototype`).
- [ ] **RunCaps defaults** validate against the `RunCaps` shape — all 6 caps present (maxPopulation, maxGenerations, energyBudget, maxSpawnDepth, maxToolCalls, wallClockTimeoutMs) and positive/within sane bounds; an out-of-bounds default aborts boot.
- [ ] **Credentials never in the config object** (rule #4 / LESSON 27): the returned `AppConfig` carries NO credential field (env-only); a Zod/boot error names the var/key/path, never the secret value (reuses the kernel-014 `summarizeValidationIssues` pattern — path+code, no `.message`/`.received`).
- [ ] **Immutable config:** the returned `AppConfig` is deep-frozen (`Object.freeze`) AND typed `readonly` (defense-in-depth) — a runtime mutation attempt throws (strict) / is a no-op and is type-rejected; downstream kernel code cannot mutate boot config.
- [ ] All unit tests in `apps/api/test/unit/runtime/config/loadConfig.test.ts` pass; the P2.2 registry tests stay green if Q1 = single-source.
- [ ] `/preflight` clean.

## Wiring / entry point (Step 7.5)
**Partial wiring lands here; full kernel boot is P3.10/P3.12.** `loadConfig` is THE boot entry — the production caller is the worker/boot sequence (`migrate → loadConfig → seed → start`); the in-process worker (P3.12) + generation loop (P3.10) consume the returned immutable `AppConfig`. This slice lands `loadConfig` reachable + tested; its first production consumer is the P3.12 worker boot (named, lesson 20 explicit-deferral). Confirm `loadConfig` is the single composition point (not parsing scattered across modules).

## Files expected to touch
**New:**
- `apps/api/src/runtime/config/loadConfig.ts` — `loadConfig({env, fileSources})` → frozen `AppConfig`; composes `validateRunConfig` + `loadModelRegistry` + `assertProviderCredentials` + scoring-policy/caps/problem-set validation.
- `apps/api/src/runtime/config/configSchema.ts` — the `AppConfig` Zod schema + the per-source schemas not already in contracts/P2.2 (scoring-policy-config, caps-defaults, problem-sets).
- `apps/api/src/runtime/config/envSchema.ts` — env shape (required vars; delegates the credential assertion to `assertProviderCredentials`).
- `apps/api/test/unit/runtime/config/loadConfig.test.ts`
- *(if Q1 = single-source)* `apps/api/src/shared/deep-merge.ts` — the shared in-track `deepMerge` (+ its own unit test) that both `model-gateway/config.schema.ts` and `runtime/config` import.

**Modified:**
- *(if Q1 = single-source)* `apps/api/src/model-gateway/config.schema.ts` — re-point its local `deepMerge` to the shared util (remove the mirror; keep behavior identical — P2.2 registry tests must stay green).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2 — `apps/api/test/unit/runtime/config/loadConfig.test.ts`)
1. **`loadConfig_valid_returns_frozen_appconfig`** — valid env + file sources.
   - Asserts: returns an `AppConfig` with runConfig/registry/scoringPolicy/caps/problemSets present; `Object.isFrozen` true (positive guard).
   - Why: §5 boot — single validated immutable config.
2. **`loadConfig_invalid_source_fails_fast_field_pointing`** — a config file with a bad field.
   - Asserts: throws a boot error naming the offending `path`+`code`; no partial config returned.
   - Why: §15 fail-fast, field-pointing.
3. **`loadConfig_missing_required_env_names_var`** — drop `OPENROUTER_API_KEY` (or DB URL).
   - Asserts: aborts naming the missing var (via `assertProviderCredentials`).
   - Why: §14 required-env fail-fast.
4. **`loadConfig_precedence_env_over_file_over_defaults`** — same overridable key set in all three layers.
   - Asserts: env value wins; file beats defaults; arrays replaced not merged.
   - Why: §15 deterministic precedence.
5. **`loadConfig_runcaps_defaults_out_of_bounds_rejected`** — a non-positive / missing cap default.
   - Asserts: aborts (RunCaps shape violation).
   - Why: caps defaults validated at boot.
6. **`loadConfig_no_credential_in_config_object`** — env carries secrets.
   - Asserts: the returned `AppConfig` (deep-walked) contains NO secret value; creds are env-only.
   - Why: rule #4 / LESSON 27.
7. **`loadConfig_error_does_not_echo_secret`** — an invalid config whose offending value is secret-shaped.
   - Asserts: the boot error message contains the path but NOT the secret value (path+code only).
   - Why: rule #4 / LESSON 26+27 (no value echo).
8. **`loadConfig_appconfig_is_immutable`** — attempt to mutate a returned field.
   - Asserts: throws in strict mode / no-op + frozen; nested objects frozen too (deep).
   - Why: downstream cannot mutate boot config.
9. *(if Q1)* **`shared_deep_merge_parity_and_pollution_safe`** — the shared `deepMerge` skips `__proto__`/`constructor`/`prototype`, replaces arrays, deep-merges objects.
   - Why: single-source parity with the P2.2 mirror (LESSON 4); registry tests stay green.

> **Positive-guard discipline (LESSON 10):** each fail-fast/reject test leads with a positive happy-path guard.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NONE. Consumes frozen `RunConfig`/`RunCaps`/`ScoringPolicy`/`RegistryConfig`; `AppConfig` is an adapter-local composition type (not Appendix-A).
- **Orchestrator doc rows to write hot:** likely a **convention candidate** (single-source `deepMerge` resolved; the boot-config composition pattern) → I bank a lesson at Step 9 if it surfaces. Possible §5/§15 arch-note (the boot sequence `migrate→loadConfig→seed→start`) → cody ledger.
- **§2.5-seam model touched?** No.

## Things to flag at Step 2.5
1. **`deepMerge` single-source — extract a shared in-track util now (P3.1 = 2nd consumer), or keep mirroring (3rd copy)?** My default vote: **extract `apps/api/src/shared/deep-merge.ts`** and re-point `model-gateway/config.schema.ts` to it (the contracts copy stays private/frozen — out-of-track to edit). P3.1 is exactly the "2nd in-track consumer" trigger the lesson-27 note named; a 3rd mirror is the wrong direction. The re-point is behavior-identical (P2.2 registry tests must stay green). Defer-and-mirror only if the re-point proves risky.
2. **`AppConfig` shape — one composite immutable object vs separate validated objects?** My default vote: **one composite `AppConfig` { runConfig, registry, scoringPolicy, caps, problemSets }** — the kernel consumes a single immutable handle (the tracker's "single validated immutable config object").
3. **Immutability mechanism — deep `Object.freeze`, `readonly` types, or both?** My default vote: **both** — deep-freeze at runtime + `readonly` types at compile-time (defense-in-depth; a runtime mutation throws, the type system rejects it too).
4. **Reuse `validateRunConfig` (P0.3) for the RunConfig portion?** My default vote: **yes, reuse — do NOT reinvent** (carry-forward: it's the canonical boot-config entry). `loadConfig` composes it; the new schemas cover only the not-yet-covered sources (scoring-policy-config, caps-defaults, problem-sets).
5. **Does `loadConfig` own the credential assertion + registry load, or just file parsing?** My default vote: **`loadConfig` is the single composition point** — it calls `assertProviderCredentials(env)` + `loadModelRegistry(...)` + `validateRunConfig(...)` so boot has ONE entry, not scattered parsing (matches the tracker's "successful boot exposes a single validated config object").

## Dependencies + sequencing
- **Depends on:** P0.3 (`validateRunConfig`/`RunConfig`/`RunCaps`) ✓ · P0.8 (`ScoringPolicy`) ✓ · P2.2 (`loadModelRegistry`/`assertProviderCredentials`/`RegistryConfig`) ✓. (Tracker says "Depends on: none" — no BLOCKING upstream; it composes already-landed validators.)
- **Blocks:** P3.4 (caps enforcement reads `RunConfig.caps` from `AppConfig`) · P3.10/P3.12 (worker + generation loop consume `AppConfig`) · the gateway-composition boot wiring (role-dispatching `providerCall` — see note below).

## Estimated commit count
**1.** Cohesive foundational slice (boot config). NOT bundled with P3.2 (state machines — different concern). **Invariant-ADJACENT** (rule #4 credential boundary + config immutability) → **security-reviewer in the loop** (invariant policy) — review the credential-never-in-config + no-echo + immutability legs. If Q1 = single-source, the `deepMerge` extraction rides this commit (behavior-identical refactor + parity test).

**Note (next slice, not this one):** the **role-dispatching `providerCall`** that composes the openrouter/embedding/retrieval adapters behind the gateway (+ per-role-timeout = adapter config) is the gateway-composition boot-wiring carry-forward — a SEPARATE slice that depends on this `AppConfig` (it needs the registry + creds). I'll author it next, not bundle it into P3.1 (config foundation stays focused).

## Lessons-logged candidates anticipated
- **Convention candidate** — single-source `deepMerge` resolved at the 2nd in-track consumer (extract shared util, re-point the mirror; contracts copy stays private) — closes the lesson-27/§4 carry-forward.
- **Convention candidate** — the boot-config composition pattern: ONE `loadConfig` composes the canonical validators (`validateRunConfig`/`loadModelRegistry`/`assertProviderCredentials`) → a single deep-frozen `AppConfig`; creds env-only + errors path+code-only.
- **Architecture-doc note (§5/§15)** — the boot sequence `migrate → loadConfig → seed → start` + the immutable-`AppConfig` contract.

## How to invoke
1. **Read this brief end-to-end** — Q1 (deepMerge single-source) + Q5 (loadConfig as the single composition point) shape the surface.
2. **Run `/tdd boot_config_loader`**.
3. **Step 0/1** — confirm restatement + file list (note the optional Q1 files).
4. **Step 2.5** — send the per-test `Asserts: <invariant> (§anchor)` write-up + coverage map; take defaults or ping back.
5. **Step 9** — surface anything beyond the anticipated candidates.
