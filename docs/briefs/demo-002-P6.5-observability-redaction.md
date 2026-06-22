# /tdd brief — observability_langfuse_redaction

## Feature
The **Langfuse-emit-boundary secret-redaction scrub** (KEY SAFETY RULE #4, §14) in the demo track's `packages/observability`: a single scrub that **composes the frozen `@doppl/contracts` `scrubSecrets`** (key-format + key-name layers — never reimplemented) **+ a boundary-local env-value layer** (any payload string containing a loaded `process.env` secret value is redacted, over object **KEYS + array elements + string values** with **de-collision**) — the observability twin of the P1.2 event-store `scrubEventPayload` — wired into a **before-emit boundary** that scrubs every payload **BEFORE any Langfuse export** and **fails safe** (a failed export logs a local-only warning and writes **NO** event-log entry; Langfuse is non-authoritative, §13). Includes the **slice-0 bootstrap** of the `@doppl/observability` package. **Safety-invariant → solo commit + Step-8 security-reviewer.**

## Use case + traceability
- **Task ID:** P6.5 (secret redaction at the persistence boundary — scrub before Langfuse emit)
- **Architecture sections it implements:** `ARCHITECTURE.md §14` (secret redaction at the persistence boundary — the scrub runs in `observability` **before Langfuse emit**; the **env-value layer redacts object keys + array elements + values with de-collision** over the open-key payload; credentials load only from env, never threaded into persisted/emitted objects), `§13` (Langfuse is **non-authoritative** — a failed export emits a **local-only warning** and writes no event-log entry).
- **Related context:** key safety rule **#4**. **Mirrors the shipped event-store twin** `apps/api/src/event-store/redaction.ts` (`scrubEventPayload` = frozen `scrubSecrets` + the env-value layer; P1.2, lessons L21/L22) — **same composition, applied at a second boundary**. Carry-forward **§14** (P6.5 MUST redact **KEYS** too, with de-collision — a values-only scrub leaks a secret-used-as-key verbatim; `RunEventEnvelope.payload` / `GENERIC_PAYLOAD_SCHEMA` are open `z.record`). Consumes the frozen `scrubSecrets` + `REDACTION_PLACEHOLDER` (`@doppl/contracts`, P0.2). Greenfield package per **lesson §2**. **Unit-only** (pure scrub + injected-emitter boundary — no DB/testcontainers).

> **Cross-track sequencing (orchestrator pre-orient — IMPORTANT).** The real Langfuse SDK adapter (gateway trace emission) is **P2.8 (kernel track) and is NOT merged** (verified: no Langfuse adapter in `apps/api/src` or `packages/` — only the envelope's `langfuse*` columns exist). P6.5 is **not blocked**: it ships the redaction + the before-emit boundary **seam** with an **injected emitter** (lesson L24 — fake the provider/IO, run the real discipline); the before-emit reachability is pinned against this observability boundary **now**. **P2.8 later injects the real Langfuse client** and MUST import this scrub, never reimplement it (the §14 "one scrub function" — see Cross-doc, raised to the lead as a §2.5-seam Finding). **No live P2.8/P3/P5 events needed.**

> **Drift correction (orchestrator pre-orient).** The tracker's P6.5 file line lists `apps/api/event-store/redaction.ts (NEW)` — but that file **already shipped (P1.2)** and is the event-store twin; **P6.5 does NOT recreate or touch it** (it is kernel-owned + merged). The single shared frozen layer is `scrubSecrets` in `@doppl/contracts`; the event-store twin already composes it; P6.5 builds the **observability** twin. The real path is `packages/observability/src/…` (the package itself is new).

## Acceptance criteria (what "done" means)
- [ ] `packages/observability` is bootstrapped as **`@doppl/observability`** (mirrors the `@doppl/contracts` toolchain — `type:module`, `exports`→`src/index.ts`, `lint`/`typecheck`/`test` scripts; **depends on `@doppl/contracts`**) and is picked up by the `packages/*` workspace glob
- [ ] A single observability scrub **composes the frozen `scrubSecrets`** (`@doppl/contracts`; key-format + key-name layers — NEVER reimplemented, lesson §5) **+ the boundary-local env-value layer**: any payload string containing a loaded `process.env` secret value is redacted to `REDACTION_PLACEHOLDER`
- [ ] The env-value layer redacts **object KEYS + array elements + string values**, with **de-collision** (`[REDACTED]`, `[REDACTED]#2`, …) — keys are producer-controlled (open `z.record`); a values-only scrub leaks a secret-as-key (carry-forward §14 / lesson L21)
- [ ] Empty/short secrets are guarded (**≥8 chars** + not a `REDACTION_PLACEHOLDER` substring) so a missing/blank env var can't blanket-redact; **literal `split`/`join`, never a built regex** (lesson L21)
- [ ] **Pure:** the scrub reads no `process.env` itself — secret values are **INJECTED** at the boundary (IO at the boundary, lesson §4); deep, **idempotent**, structure-preserving, **non-mutating** (returns a deep copy)
- [ ] **Before-emit reachability (rule #4 / §14):** the scrub runs on the **real before-emit boundary path BEFORE any emitter is called** — an unscrubbed payload cannot reach an emitter (pinned with an **injected emitter** that records what it received)
- [ ] **Fail-safe (§13):** a failed export (the injected emitter throws) emits a **local-only warning** and writes **NO** event-log / `run_events` entry (Langfuse is non-authoritative — the emit boundary never appends to the authoritative log)
- [ ] **Structural:** credentials load only from env and are never threaded into the persisted/emitted request/response objects (no credential field on the emit boundary's payload type)
- [ ] Scrubbing is applied **before the bytes leave the process**, so projections/replay/traces never observe an unredacted secret
- [ ] Unit tests pass (table-driven over key/value/array/key-collision/short-secret/idempotency cases, mirroring the P1.2 redaction suite) + the injected-emitter boundary tests; **both counts reported** (unit; integration n/a — pure + injected IO); `/preflight` clean

## Wiring / entry point (Step 7.5)
**none — wiring lands in P2.8.** The observability scrub's **first production consumer is the P2.8 Langfuse adapter** (kernel track, not merged): it injects the real Langfuse client into this before-emit boundary, which scrubs every payload before export. Exercised now via an **injected fake emitter** (lesson L24 — runs the real scrub + fail-safe discipline without the SDK). The scrub export is also the boundary **P6.10** (kernel-logger before external emit) will reuse. So: *first consumer — P2.8 (injects the real client); also reused by P6.10; exercised now via an injected emitter.*

## Files expected to touch
**New:**
- `packages/observability/package.json` — `@doppl/observability` (mirror `@doppl/contracts`; add `@doppl/contracts` dep)
- `packages/observability/tsconfig.json` (+ whatever the `@doppl/contracts` toolchain mirror needs per lesson §2 — `paths` w/o `baseUrl`, no `rootDir` for cross-package source; `.prettierignore` scoping)
- `packages/observability/src/redaction.ts` — the Langfuse-boundary scrub (compose `scrubSecrets` + the env-value layer; **mirror** `apps/api/src/event-store/redaction.ts` `scrubEventPayload`)
- `packages/observability/src/emit.ts` — the before-emit boundary: scrub → injected `emit(payload)` → fail-safe local warning (no event-log write)
- `packages/observability/src/index.ts` — barrel
- `packages/observability/test/redaction.test.ts` — pure-scrub unit tests
- `packages/observability/test/emit.test.ts` — before-emit reachability + fail-safe (injected emitter)

**Modified:** none. **Do NOT touch** `apps/api/src/event-store/redaction.ts` (shipped P1.2, kernel-owned). Possibly the root `pnpm-workspace.yaml` `allowBuilds` only if a new native build-dep appears (unlikely — no DB here; flag at Step 9 if so).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

**`packages/observability/test/redaction.test.ts`** (`spec(§14)`):
1. **`test_composes_frozen_scrub_with_no_secrets`** — with injected secrets empty, output `== scrubSecrets(payload)` (the frozen key-format + key-name layers are intact, not reimplemented). Why: §14 compose-not-reimplement (§5). *(Positive guard — lesson §10.)*
2. **`test_redacts_env_value_in_string`** — a payload string containing a loaded secret value → `REDACTION_PLACEHOLDER`. Why: §14 env-value layer.
3. **`test_redacts_secret_used_as_object_key`** — a secret used as a payload KEY is redacted (not only values). Why: carry-forward §14 / L21 key-leak class.
4. **`test_redacts_secret_in_array_element`** — a secret inside an array element is scrubbed. Why: L21.
5. **`test_key_collision_de_collides`** — two distinct secret keys that redact alike don't collapse/drop a value (de-collision suffix). Why: L21.
6. **`test_short_or_blank_secret_no_blanket_redact`** — a `<8`-char / blank "secret" does not blanket-redact the payload. Why: L21 guard.
7. **`test_idempotent_structure_preserving_non_mutating`** — re-scrub is a no-op; structure preserved; the input object is not mutated (deep copy). Why: L21/§3.
8. **`test_pure_reads_no_process_env`** — the scrub reads no `process.env` (secrets injected). Why: lesson §4.

**`packages/observability/test/emit.test.ts`** (`spec(§14)`/`spec(§13)`):
9. **`test_scrub_runs_before_emit`** — the injected emitter receives a **scrubbed** payload; a secret in the input never reaches the emitter. Why: §14 before-emit reachability (rule #4). *(Positive-guarded so RED isn't vacuous.)*
10. **`test_failed_export_local_warning_no_event_write`** — an emitter that throws → a local-only warning is logged and **no** event-log/`run_events` write occurs. Why: §13 Langfuse non-authoritative.
11. **`test_no_credential_threaded_into_emit`** — (structural) the emit boundary's payload type carries no credential field; env-loaded secrets are not threaded into the emitted object. Why: §14 structural guarantee.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none** (consumes frozen `scrubSecrets` + `REDACTION_PLACEHOLDER` + the open payload record; redefines nothing).
- **§2.5-seam (shared-contract) touched? YES — and it is a safety boundary → a FINDING for the lead.** P6.5 defines the **canonical Langfuse-boundary scrub** in `packages/observability` (demo track); **P2.8 (kernel Langfuse adapter) MUST import + call it before emit, never reimplement** (the §14 "a single scrub function" + a safety invariant crossing a §2.5 track edge). The orchestrator raises this to the lead as a cross-track **Finding** when the slice lands (kernel must consume, not duplicate — drift between two scrub copies is the L21 key-leak class).
- **Orchestrator doc rows to write hot (Step 9):** a likely **LESSONS** entry (the observability twin of L21 — boundary-local env-value layer at the Langfuse-emit boundary + the inject-emitter fail-safe). Possibly a `§13` **architecture note** pinning the inject-emitter fail-safe (failed export → local warning, no event-log entry). `§14` already names both boundaries — no new §14 text needed. I author hot.

## Things to flag at Step 2.5
1. **Emit-boundary seam shape.** My default vote: an **injected `emit(payload)` function** (lesson L24 — run the real scrub + fail-safe discipline, inject the IO); P2.8 passes the real Langfuse client. Keeps P6.5 SDK-free + fully testable now. Flag if you'd prefer an interface/class seam.
2. **Re-compose the env-value layer boundary-locally vs hoist to contracts.** My default vote: **RE-COMPOSE boundary-locally** in `packages/observability`, mirroring `apps/api`'s `scrubEventPayload`. **The architecture has already decided this** (§14: the frozen `scrubSecrets` is key-format + key-name only; the **env-value layer is "applied at the boundary where env loads"** — boundary-local, lesson L21). Do **NOT** hoist into the frozen contracts and do **NOT** touch the shipped `apps/api` twin. **Drift-risk mitigation:** the two boundary copies must stay in sync (both redact keys+arrays+values with de-collision) — pin both with parallel suites; extract a shared **pure** helper only when a **third** boundary appears (P6.10 kernel-logger is the likely trigger — YAGNI until then). Confirm: re-compose, note the future-extraction trigger.
3. **Where the injected secret-values list comes from.** My default vote: **injected at construction**, mirroring the event-store's `createEventStore({secretValues})` — a `createRedactor({secretValues})` / the emit boundary takes `secretValues`; the boot layer loads `process.env` and injects (IO at the boundary, §4/§15). Confirm the injection shape matches the event-store's.
4. **Content toggle (§13 Q3) scope.** My default vote: **OUT of scope for P6.5.** The operator content-toggle (disable ALL external content logging for a sensitive live prompt) is a separate switch on the observability adapter (P2.8 / later), distinct from the unconditional secret scrub (which always runs). Name it, don't build it. Confirm the boundary.

## Dependencies + sequencing
- **Depends on:** P0.2 (frozen `scrubSecrets` + `REDACTION_PLACEHOLDER` — frozen). **Independent of P6.1.** **No live P2.8/P3/P5 events needed** (injected emitter).
- **Blocks:** **P2.8** (kernel Langfuse adapter — injects the real client into this boundary + imports this scrub), **P6.10** (kernel-logger reuses the before-external-emit scrub). The redaction half of the §14 "scrub before append AND before Langfuse emit" pair (the before-append half shipped P1.2).

## Estimated commit count
**1.** **SAFETY-INVARIANT (rule #4 — secret redaction at the persistence boundary).** OWN commit, **SOLO, never bundled** (root `CLAUDE.md` TDD posture + brief-template pitfall). **`security-reviewer` fan-out at Step 8 REQUIRED** (focus: the env-value layer redacts **keys + arrays + values with de-collision**; the short/blank-secret guard holds; the scrub runs **before every emit**; no credential threading; pure / reads-no-env; the fail-safe never writes the authoritative log).

## Lessons-logged candidates anticipated
- **Convention candidate** — "the **observability twin** of L21: the Langfuse-emit boundary applies the SAME boundary-local env-value layer (keys+arrays+values, de-collision, ≥8 guard, literal split/join) composed over the frozen `scrubSecrets`; the emit boundary **injects the emitter** (L24) and **fails safe** (failed export → local warning, **no** event-log write, §13). Two boundaries now share the pattern (event-store, observability) — extract a shared **pure** helper only at a third boundary (YAGNI)."
- **Architecture-doc note candidate** — a `§13` note pinning the inject-emitter fail-safe (failed Langfuse export → local-only warning, never an event-log entry), if the implementer judges it load-bearing.

## How to invoke
> The demo implementer session is already oriented (P6.1 ran in it) — skip `/session-start`; jump to `/tdd`.

1. **Read this brief end-to-end** — **safety-invariant** (rule #4): SOLO commit + **Step-8 security-reviewer**. Unit-only (pure scrub + injected-emitter boundary; no DB). Note the two pre-orient corrections (P2.8 not merged → injected emitter; do NOT touch the shipped `apps/api` redaction).
2. **Run `/tdd observability_langfuse_redaction`.**
3. **Step 0 (Restate)** — confirm the restatement matches the Feature line.
4. **Step 2.5** — answer the 4 design questions (esp. Q2 re-compose-not-hoist + Q1 injected emitter), send the Step-2.5 write-up with the per-acceptance-bullet coverage map.
5. **Step 8** — `security-reviewer` on the slice diff (keys+arrays+values de-collision + before-emit reachability + fail-safe-no-log focus).
6. **Step 9** — surface the LESSONS candidate; **note the P2.8-must-import-not-reimplement §2.5-seam Finding** (I raise it to the lead).
