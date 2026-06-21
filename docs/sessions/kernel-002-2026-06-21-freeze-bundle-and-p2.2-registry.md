# Session kernel-002 — Freeze bundle (implementer view) + P2.2 model registry

**Date:** 2026-06-21
**Track:** kernel · **Role:** implementer (kernel-runtime-implementer)
**Phase:** P1 (persistence & event store) + P2 (model gateway)
**Predecessor:** `kernel-001-2026-06-21-freeze-bundle.md` (orchestrator round framing — same round)
**Successor:** _(next kernel-runtime-implementer session — set on cycle)_

## Why this session existed

The kernel-runtime-implementer's first session: implement the kernel track's **freeze bundle** (the 7 slices that unblock the verifier/selection/demo forks) via `/tdd`, then resume the post-freeze arc with **P2.2 (model registry)**. `kernel-001` is the orchestrator's round summary; this is the implementer's technical close-out (TDD audit, per-feature reachability, open follow-ups). Cycled at the P2.2 clean boundary (context WARN) before the sizable P2.5 OpenRouter adapter.

## What was built (8 slices)

| Slice | Topic | Commit | Tests |
|---|---|---|---|
| P1.1 | `@doppl/api` scaffold + `@doppl/contracts` adopt | `1c301b1` | +2 unit |
| P2.1 | `ModelGateway` port over frozen wire contracts | `171fe23` | +3 unit |
| P1.2 | event-store redaction scrub (rule #4) | `1f79273` | +9 unit |
| P2.4 | structured-output discipline (rule #5) | `9c8c886` | +10 unit |
| P2.9 | recorded/fake gateway stub | `7fb9259` | +8 unit |
| P1.4 | Drizzle migrations + canonical tables + testcontainers (rule #2) | `ec3a549` | +8 integration |
| P1.3 | append-only authoritative writer (rule #2/#4) | `8bcce9c` | +10 integration |
| P2.2 | role-keyed model registry + credential boundary (rule #4) | `8df860a` | +9 unit |

**Final suite:** contracts 163/163 + apps/api **41 unit / 18 integration**; typecheck/lint/format clean. Every safety-invariant slice (P1.2/P1.3/P1.4/P2.4/P2.2) got a `security-reviewer` pass — all CLEAR (P1.2 found+fixed a [high] in-slice).

**Files created (P2.2, this doc's net-new beyond kernel-001's freeze-bundle list):**
- `apps/api/src/model-gateway/config.schema.ts` — `RouteConfig`/`RegistryConfig` (strict) + local `deepMerge` (lesson §4 discipline)
- `apps/api/src/model-gateway/registry.ts` — `loadModelRegistry` / `createModelRegistry` (`resolve`/`capabilityFor`) / `assertProviderCredentials`
- `apps/api/src/config/model-registry.config.ts` — `DEFAULT_MODEL_REGISTRY` (tiered role→route map)
- `apps/api/test/unit/model-gateway/registry.test.ts` — 9 unit tests
**Files modified (P2.2):** `apps/api/src/model-gateway/index.ts` (registry exports).
_(Freeze-bundle file inventory is in `kernel-001`; key shared surfaces this session created: `apps/api/src/event-store/{redaction,schema,migrate,append,sequence,index}.ts` + migrations, `apps/api/src/model-gateway/{port,gateway,structured-output,index,stub/*}.ts`, the testcontainers harness + integration/unit vitest split.)_

## Decisions made (implementer-side; round-level decisions in kernel-001)

- **P2.2 credential boundary:** `RouteConfig` strict → a credential field is structurally unrepresentable (lesson §9 applied to creds); `assertProviderCredentials` env-only + fail-fast, var-naming (not value-echoing) errors. Required env = `[OPENROUTER_API_KEY, OPENAI_API_KEY, DATABASE_URL]` (retrieval key → P2.7).
- **P2.2 `deepMerge` mirrored locally** (private in frozen contracts; editing them is out-of-track) with lesson §4 footguns cited; `RouteConfig.tier?` dropped (tiering is load-bearing via per-role `modelId`).
- (Round-level — see kernel-001 for full rationale): testcontainers harness; no-FK event-store; `AppendInput` omits sequence+occurredAt; advisory-lock sequence allocation; P2.4 narrowed dep; append-only [high] = defer-to-hosted (user-ruled).

## Decisions explicitly NOT made / deferred

- **Single-source `deepMerge`** — mirrored locally; cross-track frozen-package export deferred until a 3rd consumer (P3.1 boot-config) needs it (orchestrator carry-forward).
- **Least-privilege DB role split** (the P1.4 [high]) — user-ruled defer-to-hosted; P3.3 come-back note + ARCHITECTURE §9 (orchestrator-written; integration `c066a12`). Local demo = trigger-only (accepted).
- Real OpenRouter/OpenAI/retrieval adapters (P2.5/2.6/2.7), gateway redaction (P2.3), replay reader (P1.8), boot wiring (P3.1) — all post-this-session.

## TDD compliance

- **Clean, RED-first, for 7 of 8 slices** — each: failing test (right reason) → minimal GREEN → full suite → reachability → typecheck/lint/format → (invariant slices) security-reviewer → commit.
- **P1.3 — recovered ordering slip (no shipped violation):** I initially drafted the impl alongside the test before confirming RED. Caught it, **removed the impl files**, confirmed a genuine RED (unresolved-import) on the test, then re-authored the impl at GREEN. Net: RED→GREEN with a real RED observed. Recorded here for honesty.

## Reachability (per feature; Step-7.5 statements carried forward)

- **P1.2 `scrubEventPayload`** — NOW WIRED: called by the P1.3 append path before every insert (was deferred at P1.2).
- **P1.4 `runMigrations`** — boot entry; exercised by the testcontainers harness; consumed by P1.3 (append writes through the schema). Full `migrate→seed→start` boot wiring = P3.
- **P1.3 `createEventStore().append`** — sole authoritative write; first consumer P3 kernel; `readByRun` → P1.8 replay + P6 projections.
- **P2.1 port / P2.4 discipline / P2.2 registry / P2.9 fake** — seam surfaces consumed in later phases (P2.5 adapter, P3 runtime, verifier/selection/demo forks). Explicit-deferral, all named to real tasks — **no tested-but-unwired silent gaps**.

## Open follow-ups

- **Carry-forwards converged at P1.3 → orchestrator DELETE triage at `/orchestrate-end`:** IDs-opaque, payload-ceiling-P1, §14-redaction, gateway-passthrough-scrub.
- **P3.1:** `validateRunConfig` boot path; re-confirm gateway/registry env-injection stays at the boundary + never persisted (P2.2 reviewer note); single-source `deepMerge` if it becomes a 3rd consumer.
- **P3.3 (hosted-gated):** least-privilege DB role split (append-only [high], defer-to-hosted).
- **P1.3 reviewer forward-guard (banked §26):** never echo payload content in authoritative-path error messages (the `schema_invalid` AppendError today can't, but guard if payload validation ever folds into the envelope parse).
- **Root touches — lead reconciles at merge:** `pnpm-workspace.yaml` `allowBuilds` (esbuild/ssh2/cpu-features), `.prettierignore` (generated migrations dir + TDD-fixture gitleaks fingerprints), `pnpm-lock.yaml`.
- **Next slices:** P2.5 (OpenRouter adapter) → P2.6/P2.7, P2.3 (gateway redaction, invariant), P1.5/P1.6 (energy/novelty payloads), P1.7 (evidence resolver), P1.8 (replay reader).

## Process notes

- **Infra transients ridden out:** a wedged Docker engine (persistent 500 `/_ping`) blocked GREEN mid-P1.4 → user restarted Docker Desktop; pnpm 11 blocked all commands until the new native-build deps were `allowBuilds`-listed; gitleaks blocked on fake `sk-`/DB-password TDD fixtures → fingerprint-ignored per the seeded `.gitleaksignore` workflow (bare fingerprint, no inline comment); the P1.3 security-reviewer hit session-limit/classifier-blip/rate-limit before succeeding on retry. No code impact from any.
- **Directed security-reviewers paid off:** the P1.2 [high] secret-as-KEY leak was caught with reproduced evidence against a real container (deferred-to-evidence over a blessed values-only scope); P1.3 verified 100-concurrent-across-two-pools → gapless 0..99 (TOCTOU proof).
