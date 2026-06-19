---
status: completed
title: "feat: Scaffold + Phase 0 contract freeze (Doppl)"
type: feat
created: 2026-06-19
depth: deep
origin:
  - IMPLEMENTATION_PLAN.md (Phase 0 §149-340, scaffolding implied)
  - ARCHITECTURE.md §4, §2.5, §6, §14, §15, Appendix A
  - docs/planning/DECISIONS.md
  - docs/planning/DATA_MODEL.md
  - docs/planning/DOMAIN_MODEL.md
  - docs/planning/REQUIREMENTS.md
  - docs/planning/CONSTRAINTS.md
  - docs/planning/CLAUDE_CODE_HANDOFF.md
---

# feat: Scaffold + Phase 0 contract freeze (Doppl)

## Summary

Bootstrap the Doppl monorepo and freeze every shared contract in `packages/contracts/` so the four downstream tracks (`kernel`, `verifier`, `selection`, `demo`) can fork and run in parallel. This is the forced-serial bottleneck identified in `IMPLEMENTATION_PLAN.md` §52 — every other phase waits on Phase 0. The deliverable is a runnable TypeScript monorepo with Zod schemas (and `z.infer` types) for every Appendix-A model, the closed `RunEventType` registry, the closed 7-role actor union, the secret-redaction scrub function, the boot config-validation entry, and the consumer/producer contract-test surface. No runtime, no kernel, no UI — only the freeze.

---

## Problem Frame

Today the repository contains the planning corpus (`ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `docs/planning/*`) and nothing executable. The plan was intentionally authored against a custom session protocol (`/orchestrate-start`, `/session-start`, `/tdd`, `/phase-exit`); we are picking it up under `ce-work` instead, which requires the per-unit `Goal / Files / Approach / Test scenarios / Execution note / Verification` shape rather than checkbox acceptance criteria.

The work in this plan is therefore both **technical** (scaffold + freeze contracts) and **format-translational** (re-shape P0.1 – P0.15 into ce-work units while preserving every spec anchor and `Appendix A`-derived field-set). A field-set change after this freeze becomes a cross-track regression (`ARCHITECTURE.md §2.5`), so the schema-snapshot tests under each unit are load-bearing — they are the safety pin that catches drift across the four parallel tracks.

---

## Scope Boundaries

**In scope:**
- Monorepo bootstrap (workspace tool, base tsconfig, lint, test runner, root scripts).
- `packages/contracts/` package with Zod schemas + `z.infer` types for every Appendix-A model referenced by `IMPLEMENTATION_PLAN.md` P0.1 – P0.15.
- Closed `RunEventType` registry, closed 7-role actor union, per-type payload-shape map (envelope narrowing).
- Secret-redaction scrub contract (pure function used at both Postgres append and Langfuse emit boundaries).
- Boot config-validation entry (defaults < file < env precedence).
- Contract-test surface: field-name-set schema-snapshot tests (`spec(§X)`-tagged) for every model and one consumer/producer payload-agreement matrix.

**Deferred for later** (next plans, not non-goals):
- `apps/api/` (kernel, model gateway, persistence) — Phases 1-3 of `IMPLEMENTATION_PLAN.md`.
- `apps/web/` (React Flow dashboard) — Phase 7.
- Drizzle migrations themselves — Phase 1 (the *schemas* freeze here; the migration chain is P1.4).
- Numeric `ScoringPolicy` weight values — the structure freezes here; weights are the only deferred-open contract values per `ARCHITECTURE.md §8`.
- Provider adapters (OpenRouter, OpenAI, retrieval) — Phase 2.
- Neo4j spike — Phase 6 (storage-agnostic projection contract here only).

**Outside this product's identity** (per `docs/planning/CONSTRAINTS.md` and `DECISIONS.md`):
- SQLite anywhere in the stack (forbidden, ADR-003).
- LangGraph as authoritative runtime (forbidden, ADR-002 — optional helper only).
- Production multi-tenant auth / workspaces (`REQ-DEF-005`).
- Model SDK calls from domain/runtime code (must route through gateway, `ARCHITECTURE.md §4A`).

**Deferred to Follow-Up Work** (plan-local sequencing):
- Retiring or formally porting the custom `/orchestrate-*` and `/session-end` slash commands to `ce-work`-native patterns. The plan is shaped to be ce-work-runnable now; the custom protocol can continue to coexist or be retired in a follow-up plan.
- A separate ce-plan for Phase 1 (persistence + event store) — should be drafted immediately after this plan ships so the `kernel` track can start.

---

## Origin Document References

- `IMPLEMENTATION_PLAN.md` Phase 0 (lines 149-340) — binding decomposition. Each U-ID below maps to one P0.x.
- `ARCHITECTURE.md` §2.5 (shared-contract seams), §4 (event model + RNG capture + redaction), §6 (module/import rules), §8 (scoring), §14 (testing strategy + redaction), §15 (fail-fast config), Appendix A (every Zod schema's authoritative field-set).
- `docs/planning/DATA_MODEL.md` — per-subtype payload shapes (CrossDomainTransfer, ZeitgeistSynthesis), actor roles, event-type enumeration.
- `docs/planning/DOMAIN_MODEL.md` — `Run`, `Generation`, `CullingEvent`, `FinalJudgeRubric` field-sets (closes Appendix-A gaps surfaced by P0.15).
- `docs/planning/DECISIONS.md` ADR-002, ADR-003, ADR-004, ADR-005, ADR-008, ADR-010 — tech locks (TS, Postgres, OpenRouter, Langfuse, React Flow, REST+SSE).
- `docs/planning/REQUIREMENTS.md` — REQ-S-004 (no secrets in payloads), REQ-NF-001 (fail-fast at boot), REQ-T-002/003/004/006 (cap/replay/structured-output/trace-correlation tests).
- `docs/planning/CONSTRAINTS.md` — forbidden tools, environment rules.
- `docs/planning/CLAUDE_CODE_HANDOFF.md` — build posture (MVP, two-week capstone, four-track parallelism).

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Package manager | **pnpm** | First-class workspaces, deterministic installs, deduped storage matters for a four-worktree parallel build (`IMPLEMENTATION_PLAN.md` §52 track map). |
| Monorepo tool | **pnpm workspaces only** (no Nx/Turbo) | Keeps the bootstrap one file; the build graph is tiny (one library + later two apps). `IMPLEMENTATION_PLAN.md` does not require remote caching or task pipelines. |
| Node version | **Node 22 LTS** | Current LTS; native `fetch`, `node:test` available as a safety net, ESM-first works cleanly with Zod + Drizzle. Pinned via `.nvmrc` and `engines`. |
| Test runner | **Vitest** | First-class TS, fast watch mode, snapshot support for field-name-set tests, `spec(§X)`-tag filter via `test.concurrent.each` / custom test names. Aligns with the snapshot discipline `IMPLEMENTATION_PLAN.md` requires at every §2.5 seam. |
| Lint + format | **Biome** | One tool covers lint + format with zero plugin sprawl; fast enough that pre-commit on a 75-unit plan stays painless. ESLint + Prettier is acceptable if the team has stronger preference — flag as call-out at execution if so. |
| Validation library | **Zod (≥ 3.23)** | Pinned by `IMPLEMENTATION_PLAN.md` P0.1+ ("Zod schemas with z.infer TS types"). |
| TS config topology | One **`tsconfig.base.json`** at root (strict, ESNext, NodeNext modules), one **`tsconfig.json`** per package extending it | Standard layout; `packages/contracts` ships ESM + types only (no runtime build needed by consumers in dev — tsx/vitest read source). |
| Path aliases | None at root — packages reference each other via workspace name (`@doppl/contracts`) | Avoids tsconfig-path/vitest/runtime alias triplication; consistent with pnpm-workspace convention. |
| `packages/contracts` build output | **`tsc --emitDeclarationOnly` for types + plain ESM source as entry** | Contracts are zero-runtime-cost (just Zod schema instances + types). No bundler. |
| Redaction placeholder constant | **`"[REDACTED]"`** exported from `packages/contracts/src/security/redaction.ts` | Stable token lets snapshot/contract tests assert without environment drift. |
| schemaVersion | **Integer constant** `CONTRACTS_SCHEMA_VERSION = 1` exported from package root | `ARCHITECTURE.md §4` requires readers accept `schemaVersion ≤ current`; one constant pinned in the package is the source of truth. |
| Cross-doc invariant test mechanism | **One snapshot file per Appendix-A model** under `packages/contracts/src/**/__tests__/*.fieldset.test.ts`, listing the schema's full field-name set (sorted) | Catches mid-build field additions/removals as a single failed snapshot before they ship as a cross-track break. |

---

## High-Level Technical Design

This section is **directional guidance** for review, not implementation specification.

### Package layout (greenfield bootstrap)

```text
doppl-prime/
├── package.json                       (workspace root; private)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── biome.json
├── vitest.workspace.ts
├── .nvmrc                             (22)
├── .env.example
├── packages/
│   └── contracts/
│       ├── package.json               ("@doppl/contracts")
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       └── src/
│           ├── index.ts               (barrel — re-exports every schema + type + constant)
│           ├── version.ts             (CONTRACTS_SCHEMA_VERSION)
│           ├── events/
│           │   ├── envelope.ts
│           │   ├── event-type.ts      (closed enum)
│           │   ├── actor.ts           (closed 7-role union)
│           │   └── payloads/
│           │       └── per-type-map.ts
│           ├── run/
│           │   ├── run-config.ts
│           │   └── run-caps.ts
│           ├── domain/
│           │   ├── agenome.ts
│           │   ├── candidate-idea.ts
│           │   ├── subtype-payloads.ts
│           │   ├── evidence-ref.ts
│           │   ├── run.ts
│           │   ├── generation.ts
│           │   ├── culling-event.ts
│           │   └── final-judge-rubric.ts
│           ├── verifier/
│           │   ├── critic-review.ts
│           │   └── critic-input.ts
│           ├── checks/
│           │   ├── check-result.ts
│           │   └── check-runner-adapter.ts
│           ├── scoring/
│           │   ├── novelty-score.ts
│           │   ├── fitness-score.ts
│           │   └── scoring-policy.ts
│           ├── reproduction/
│           │   ├── energy-event.ts
│           │   └── reproduction-event.ts
│           ├── gateway/
│           │   ├── model-route.ts
│           │   ├── model-role.ts
│           │   ├── provider-capability.ts
│           │   └── model-gateway-io.ts
│           ├── projections/
│           │   └── lineage-graph.ts
│           ├── config/
│           │   └── validate.ts        (boot config-validation entry)
│           ├── security/
│           │   └── redaction.ts       (scrub fn + placeholder constant)
│           └── testing/
│               └── fieldset-snapshot.ts   (helper: sorted field-name array from a Zod object)
└── docs/                              (existing; unchanged)
```

> The tree above is the **expected output shape**, not a constraint. Per-unit `Files:` lists are authoritative; if implementation surfaces a better layout for a specific seam, the implementing agent may adjust.

### Schema-freeze pattern (illustrative, not code-to-paste)

Every Appendix-A model follows the same shape: one file, one Zod object, one `z.infer` type, one barrel export, one `*.fieldset.test.ts` snapshot. Pseudo-code:

```ts
// packages/contracts/src/domain/agenome.ts
export const AgenomeStatus = z.enum([
  "seeded", "active", "spent", "eligible_parent",
  "failed", "reproduced", "culled",
]);
export const Agenome = z.object({ /* fields per Appendix A §3 */ }).strict();
export type Agenome = z.infer<typeof Agenome>;
```

```ts
// packages/contracts/src/domain/__tests__/agenome.fieldset.test.ts
import { fieldset } from "../../testing/fieldset-snapshot";
test("spec(§3) Agenome field-name set is frozen", () => {
  expect(fieldset(Agenome)).toMatchSnapshot();
});
```

The `.strict()` modifier on every top-level schema is the hard pin: an unknown field anywhere becomes a parse failure, not a silent passthrough. The snapshot is the cross-track regression alarm.

### Envelope narrowing (P0.10) sketch

`RunEventEnvelope.payload` is `z.unknown()` at envelope level; a separate map (`payloads/per-type-map.ts`) holds `{ [RunEventType.run_configured]: RunConfiguredPayload, ... }` so a typed reader can narrow via discriminated dispatch. This avoids a 25-arm discriminated union at the envelope level (cheaper to maintain) while keeping per-type payload validation possible at the boundary.

### Redaction scrub (P0.2) shape

A pure function `redact(payload: unknown): unknown` that walks the value, matches against a small set of regexes (provider key prefixes, `Authorization: Bearer …`, `sk-…`, `OPENAI_…=…`-style env strings) and replaces matched substrings with the `"[REDACTED]"` constant. Idempotent: `redact(redact(x))` equals `redact(x)`. Used at *both* the persistence boundary and the Langfuse emit boundary (one function, two callsites — `ARCHITECTURE.md §14`).

---

## Output Structure

See the package layout block in **High-Level Technical Design** above — the tree fully describes the greenfield output shape for this plan.

---

## Implementation Units

Each unit cites the source `P0.x` in IMPLEMENTATION_PLAN.md for traceability. `Execution note: test-first` is set on every contract unit because the field-name-set snapshot is the cross-track safety pin and must be written before the schema (per `IMPLEMENTATION_PLAN.md` §16 "RED outline includes the field-name-set schema-snapshot test").

### U1. Workspace bootstrap (pnpm + tsconfig base + Biome + Vitest workspace)

- **Goal:** A `pnpm install` at the repo root succeeds, `pnpm -w lint` and `pnpm -w test` both no-op cleanly, and `tsc --noEmit -p tsconfig.base.json` reports zero errors.
- **Requirements:** REQ-NF-001 (fail-fast tooling).
- **Dependencies:** none.
- **Files:**
  - Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `vitest.workspace.ts`, `.nvmrc`, `.env.example`
  - Modify: `.gitignore` (add `node_modules/`, `dist/`, `.turbo/` placeholder, `coverage/`, `.env`)
- **Approach:** Root `package.json` is private, declares `engines.node: ">=22"`, scripts `lint`, `format`, `test`, `typecheck`. `pnpm-workspace.yaml` lists `packages/*` and `apps/*` (apps dir empty for now). `tsconfig.base.json`: `strict: true`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `target: "ES2022"`, `lib: ["ES2022"]`, `verbatimModuleSyntax: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Biome config enables recommended rules + formatter. `vitest.workspace.ts` discovers each package's `vitest.config.ts`.
- **Execution note:** Smoke-test-first — write a trivial workspace-level test that imports nothing and asserts `1 + 1 === 2` so the tooling pipeline is exercised before any real code lands.
- **Patterns to follow:** No prior code in this repo; use the convention IMPLEMENTATION_PLAN.md §149 implies (`packages/contracts`, `apps/api`, `apps/web`).
- **Test scenarios:**
  - Tooling smoke: `pnpm -w test` runs the placeholder vitest workspace and exits 0.
  - `pnpm -w typecheck` succeeds against `tsconfig.base.json` with zero source files.
  - `pnpm -w lint` succeeds (Biome runs, finds nothing to flag).
- **Verification:** All three commands above exit 0 from a fresh clone after `pnpm install`. CI is out of scope here.

### U2. `packages/contracts` package skeleton + barrel + version constant

- **Goal:** `@doppl/contracts` exists as a workspace package that can be imported and exposes `CONTRACTS_SCHEMA_VERSION`.
- **Requirements:** REQ-NF-001; supports every later P0 unit.
- **Dependencies:** U1.
- **Files:**
  - Create: `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/vitest.config.ts`, `packages/contracts/src/index.ts`, `packages/contracts/src/version.ts`, `packages/contracts/src/__tests__/package.test.ts`
- **Approach:** Package declares `name: "@doppl/contracts"`, `type: "module"`, `main: "./src/index.ts"`, `types: "./src/index.ts"` (source-first dev; no build step). Adds `zod` and `vitest` as dependencies/devDependencies. `tsconfig.json` extends base, sets `rootDir: "src"`, `outDir: "dist"`, `declaration: true`, `emitDeclarationOnly: true`. `version.ts` exports `export const CONTRACTS_SCHEMA_VERSION = 1 as const;`. `index.ts` re-exports `version.ts` for now (units U4-U18 extend it).
- **Execution note:** test-first.
- **Patterns to follow:** Standard pnpm-workspace TS library; mirror the layout in **High-Level Technical Design**.
- **Test scenarios:**
  - Importing `CONTRACTS_SCHEMA_VERSION` from `@doppl/contracts` yields `1` (proves workspace resolution works).
  - `pnpm --filter @doppl/contracts test` exits 0.
- **Verification:** A second package (created in U3 below) can `import { CONTRACTS_SCHEMA_VERSION } from "@doppl/contracts"` and resolve via pnpm workspace symlink.

### U3. Schema-snapshot test helper + `spec()` tag convention

- **Goal:** A reusable `fieldset(schema)` helper returns a sorted array of top-level field names from a Zod object schema, and a `spec(section: string)` tagger lets tests be filtered by `ARCHITECTURE.md` anchor.
- **Requirements:** Cross-doc invariant discipline (`IMPLEMENTATION_PLAN.md` §16); supports every later P0 unit's snapshot.
- **Dependencies:** U2.
- **Files:**
  - Create: `packages/contracts/src/testing/fieldset-snapshot.ts`, `packages/contracts/src/testing/spec-tag.ts`, `packages/contracts/src/testing/__tests__/fieldset.test.ts`
- **Approach:** `fieldset(schema)` introspects a `z.ZodObject` via `.shape`, returns `Object.keys(shape).sort()`. Throws a clear error if passed a non-object schema. `spec(section)` is a string-builder: `spec("§3")` returns the prefix used in test names so a CI filter like `vitest --testNamePattern "spec\\(§3\\)"` runs all §3-anchored tests.
- **Execution note:** test-first.
- **Patterns to follow:** None — this is a new utility.
- **Test scenarios:**
  - Happy path: `fieldset(z.object({ b: z.string(), a: z.number() }))` returns `["a", "b"]` (sorted).
  - Edge case: nested object schemas return only the top-level keys (nested fieldsets are tested per-schema, not recursively).
  - Error path: `fieldset(z.string())` throws with a message naming the unsupported schema kind.
  - `spec("§4")` returns the expected prefix string usable in test names.
- **Verification:** Helper is exported from `packages/contracts/src/index.ts` and used by every subsequent unit's fieldset test.

### U4. `RunEventEnvelope` + closed `RunEventType` registry + 7-role actor union (source: P0.1)

- **Goal:** Freeze the event envelope shape, the closed event-type enum, and the closed actor union — the highest-traffic cross-track contract.
- **Requirements:** R-from `ARCHITECTURE.md §4`, `DATA_MODEL.md` actor & event-type enumerations.
- **Dependencies:** U3.
- **Files:**
  - Create: `packages/contracts/src/events/envelope.ts`, `packages/contracts/src/events/event-type.ts`, `packages/contracts/src/events/actor.ts`, `packages/contracts/src/events/__tests__/envelope.fieldset.test.ts`, `packages/contracts/src/events/__tests__/event-type.test.ts`, `packages/contracts/src/events/__tests__/actor.test.ts`
  - Modify: `packages/contracts/src/index.ts` (re-exports)
- **Approach:** `RunEventType` is `z.enum([...])` listing exactly the 21 names enumerated in `IMPLEMENTATION_PLAN.md` line 161 (lifecycle + every failure/terminal type). `Actor` is `z.enum(["operator", "runtime", "agenome", "critic", "check_runner", "selection_controller", "system"])`. `RunEventEnvelope = z.object({ id, runId, generationId: opt, agenomeId: opt, candidateId: opt, type: RunEventType, sequence: z.number().int().nonnegative(), occurredAt: z.string().datetime(), actor: Actor, correlationId: opt, langfuseTraceId: opt, langfuseObservationId: opt, payload: z.unknown(), schemaVersion: z.number().int() }).strict()`. Comment notes that `payload: z.unknown()` is intentional — per-type narrowing layers in U13.
- **Execution note:** test-first — write the three fieldset snapshots first.
- **Patterns to follow:** `ARCHITECTURE.md §4` Appendix A entry for `RunEventEnvelope`.
- **Test scenarios:**
  - Covers cross-doc invariant. `spec(§4) RunEventEnvelope field-name set is frozen` — fieldset snapshot.
  - `spec(§4) RunEventType registry is closed` — parsing `"definitely_not_an_event"` throws; parsing every enumerated name succeeds; fieldset snapshot of all 21 values.
  - `spec(§4) actor 7-role union is closed` — parsing each of the 7 roles succeeds; parsing `"developer"` throws.
  - `spec(§4) RunEventEnvelope rejects unknown envelope fields` — `.strict()` parse rejects `{ ...valid, extra: 1 }`.
  - `spec(§4) occurredAt is display-only` — schema accepts a valid ISO-8601 datetime string; the test asserts via a code comment / docstring that ordering uses `sequence` (no behavioral test here — sequence-ordering belongs to the kernel, P3.x).
  - Happy path: a fully-populated envelope with realistic values parses cleanly and `z.infer<typeof RunEventEnvelope>` types match.
- **Verification:** Fieldset snapshots are committed; `pnpm --filter @doppl/contracts test --testNamePattern "spec\\(§4\\)"` exits 0.

### U5. Secret-redaction scrub contract (source: P0.2)

- **Goal:** A pure idempotent `redact(payload)` function used at both the Postgres append boundary and the Langfuse emit boundary.
- **Requirements:** REQ-S-004; T-RISK-006/T-RISK-009; `ARCHITECTURE.md §14`.
- **Dependencies:** U3.
- **Files:**
  - Create: `packages/contracts/src/security/redaction.ts`, `packages/contracts/src/security/__tests__/redaction.test.ts`
  - Modify: `packages/contracts/src/index.ts`
- **Approach:** Export `REDACTION_PLACEHOLDER = "[REDACTED]" as const`. `redact(value: unknown): unknown` walks objects/arrays/strings recursively. Patterns match (case-insensitive where appropriate): `sk-[A-Za-z0-9]{20,}`, `Bearer\\s+[A-Za-z0-9._-]+`, `(OPENAI|OPENROUTER|ANTHROPIC)_API_KEY\\s*=\\s*\\S+`, generic `(api[_-]?key|secret|token)\\s*[:=]\\s*\\S+`. Field-name heuristic also redacts entire string values when the *key* is in a small allowlist of obvious secret keys (`apiKey`, `authorization`, `secret`, `token`). Object key ordering preserved.
- **Execution note:** test-first — the safety invariant is "no secret in any output." Write the failing invariant test first.
- **Patterns to follow:** None.
- **Test scenarios:**
  - Happy path: a payload with no secrets is returned structurally-equivalent (same keys, same order, same values).
  - Edge case: a deeply nested object with a secret three levels down has only that field's value replaced.
  - Edge case: arrays of strings containing secrets have only the matching elements replaced.
  - Idempotency: `redact(redact(x))` deep-equals `redact(x)` for several fixtures.
  - Invariant: for every fixture containing a known secret pattern, the stringified output of `redact(x)` does not contain the original secret substring (REQ-S-004).
  - The `REDACTION_PLACEHOLDER` constant is exported and equals `"[REDACTED]"` (lets downstream snapshot tests assert against it).
  - Edge case: `redact(null)`, `redact(undefined)`, `redact("")`, `redact(0)` all return their input unchanged.
- **Verification:** All scenarios pass; `redact` is exported from package root.

### U6. `RunConfig` + `RunCaps` + boot config-validation contract (source: P0.3)

- **Goal:** Freeze `RunConfig`/`RunCaps` shapes and expose a `validateBootConfig(rawConfig: unknown): RunConfig` entry that applies `defaults < file < env` precedence and fails fast on the first invalid field.
- **Requirements:** REQ-NF-001; `ARCHITECTURE.md §15` (fail-fast at boot).
- **Dependencies:** U3.
- **Files:**
  - Create: `packages/contracts/src/run/run-config.ts`, `packages/contracts/src/run/run-caps.ts`, `packages/contracts/src/config/validate.ts`, `packages/contracts/src/run/__tests__/run-caps.fieldset.test.ts`, `packages/contracts/src/run/__tests__/run-config.fieldset.test.ts`, `packages/contracts/src/config/__tests__/validate.test.ts`
  - Modify: `packages/contracts/src/index.ts`
- **Approach:** `RunCaps = z.object({ maxPopulation: z.number().int().positive(), maxGenerations: z.number().int().positive(), energyBudget: z.number().int().positive(), maxSpawnDepth: z.number().int().positive(), maxToolCalls: z.number().int().positive(), wallClockTimeoutMs: z.number().int().positive() }).strict()`. `RunConfig = z.object({ seed: z.string(), enabledSubtypes: z.array(SubtypeName).min(1), caps: RunCaps, modelProfile: z.string(), scoringPolicyVersion: z.string(), rngSeed: z.string() }).strict()` (the closed two-member subtype enum lives with the CandidateIdea unit; until U8 ships, define the enum inline here and re-export from U8). `validateBootConfig` is a thin wrapper: merge defaults → file overrides → env overrides → `RunConfig.parse`. On failure, throw a `ConfigValidationError` whose message names the *first* invalid field path.
- **Execution note:** test-first.
- **Patterns to follow:** Same `.strict()` discipline as U4.
- **Test scenarios:**
  - `spec(§4)` fieldset snapshot for `RunCaps` and `RunConfig`.
  - Happy path: `validateBootConfig({...defaults})` returns a parsed `RunConfig`.
  - Precedence: defaults are overridden by file values; file values are overridden by env values.
  - Error path: missing `rngSeed` throws `ConfigValidationError("RunConfig.rngSeed: Required")` (or equivalent message naming the first field).
  - Error path: `maxPopulation: 0` throws fail-fast with field path named.
  - Error path: `maxPopulation: -1` throws fail-fast (positive constraint).
  - Edge case: extra unknown field at root throws (`.strict()` enforces).
- **Verification:** `pnpm --filter @doppl/contracts test --testNamePattern "spec\\(§(4|15)\\)"` exits 0 and includes these tests.

### U7. `Agenome` schema (traits + closed 7-state status) (source: P0.4)

- **Goal:** Freeze the `Agenome` shape and the 7-state status union.
- **Requirements:** `ARCHITECTURE.md §3` (Appendix A Agenome).
- **Dependencies:** U3.
- **Files:**
  - Create: `packages/contracts/src/domain/agenome.ts`, `packages/contracts/src/domain/__tests__/agenome.fieldset.test.ts`, `packages/contracts/src/domain/__tests__/agenome-status.test.ts`
  - Modify: `packages/contracts/src/index.ts`
- **Approach:** `AgenomeStatus = z.enum(["seeded","active","spent","eligible_parent","failed","reproduced","culled"])`. `Agenome = z.object({ id, runId, generationId, parentIds: z.array(z.string()), systemPrompt: z.string(), personaWeights: z.record(z.number()), toolPermissions: z.array(z.string()), decompositionPolicy: z.string(), spawnBudget: z.number().int().nonnegative(), mutationMeta: opt(z.object({...}).passthrough()), status: AgenomeStatus }).strict()`. `parentIds` length is **not** schema-enforced (runtime clamps 0-2 per §3).
- **Execution note:** test-first.
- **Patterns to follow:** U4.
- **Test scenarios:**
  - `spec(§3)` fieldset snapshot for `Agenome`.
  - `spec(§3)` closed-status: each of 7 values parses; `"zombie"` throws.
  - Happy path: gen-0 seed (no `mutationMeta`, no `parentIds`) parses cleanly.
  - Edge case: `parentIds: []` (gen-0), `parentIds: ["a"]` (single parent), `parentIds: ["a","b"]` (fusion) all parse (count guard is runtime, not schema).
  - Error path: `status: "active "` (trailing space) throws.
- **Verification:** Fieldset snapshot committed.

### U8. `CandidateIdea` + subtype payloads + `EvidenceRef` (source: P0.5)

- **Goal:** Freeze the candidate shape, the closed two-member subtype union, the two subtype payloads, the closed 8-state status, and the closed evidence-kind union.
- **Requirements:** `ARCHITECTURE.md §3`, §4, §9; `DATA_MODEL.md` subtype payloads.
- **Dependencies:** U3. (U6 imports `SubtypeName` from this unit once it ships; until then U6 inlines it — once U8 lands, U6's inline is replaced with an import in this same PR.)
- **Files:**
  - Create: `packages/contracts/src/domain/candidate-idea.ts`, `packages/contracts/src/domain/subtype-payloads.ts`, `packages/contracts/src/domain/evidence-ref.ts`, `packages/contracts/src/domain/__tests__/candidate-idea.fieldset.test.ts`, `packages/contracts/src/domain/__tests__/subtype-payloads.fieldset.test.ts`, `packages/contracts/src/domain/__tests__/evidence-ref.fieldset.test.ts`
  - Modify: `packages/contracts/src/index.ts`, `packages/contracts/src/run/run-config.ts` (swap inline subtype enum for the imported one)
- **Approach:** `SubtypeName = z.enum(["cross_domain_transfer","zeitgeist_synthesis"])`. `CrossDomainTransferPayload = z.object({sourceDomain, sourceTechnique, targetDomain, targetProblem, transferMapping, expectedMechanism, executableCheckIdea: opt}).strict()`. `ZeitgeistSynthesisPayload = z.object({thesis, audience, currentSignals: z.array(z.string()), whyNow, falsifiablePredictions: z.array(z.string()), comparablePriorArt: z.array(z.string())}).strict()`. `CandidateStatus = z.enum(["created","under_review","checked","scored","selected","rejected","culled","invalid"])`. `EvidenceKind = z.enum(["trace","check_output","prior_art","signal","raw_output","other"])`. `EvidenceRef = z.object({kind: EvidenceKind, eventId: opt, uri: opt, label: opt, langfuseObservationId: opt}).strict()`. `CandidateIdea` uses `z.discriminatedUnion` keyed on `subtype` for the `subtypePayload` field, with two variants matching `SubtypeName`.
- **Execution note:** test-first.
- **Patterns to follow:** U4 (discriminated union pattern is new here — document the choice inline).
- **Test scenarios:**
  - `spec(§3)` fieldset snapshots for `CandidateIdea`, both payloads, `EvidenceRef`.
  - `spec(§3)` discriminated payload: `{ subtype: "cross_domain_transfer", subtypePayload: { thesis: "..." } }` throws (wrong payload shape for subtype).
  - `spec(§3)` discriminated payload: `{ subtype: "zeitgeist_synthesis", subtypePayload: <ZeitgeistSynthesisPayload> }` parses.
  - `spec(§3)` candidate-status closed enum: all 8 parse; one invalid throws.
  - `spec(§9)` evidence-kind closed union: all 6 parse.
  - `spec(§9)` `EvidenceRef` accepts `eventId` OR `uri` OR `langfuseObservationId` — none is required at schema level (runtime resolves).
- **Verification:** Fieldset snapshots committed; `RunConfig` no longer has an inline subtype enum.

### U9. `CriticReview` + `CriticMandate` + `criticInput` isolation shape (source: P0.6)

- **Goal:** Freeze the critic-review shape, the closed mandate union, and the prompt-injection-safe `criticInput` shape that keeps untrusted candidate text out of instruction strings.
- **Requirements:** `ARCHITECTURE.md §7`, §14; T-RISK-002 (prompt injection).
- **Dependencies:** U8 (EvidenceRef).
- **Files:**
  - Create: `packages/contracts/src/verifier/critic-review.ts`, `packages/contracts/src/verifier/critic-input.ts`, `packages/contracts/src/verifier/__tests__/critic-review.fieldset.test.ts`, `packages/contracts/src/verifier/__tests__/critic-input.test.ts`
  - Modify: `packages/contracts/src/index.ts`
- **Approach:** `CriticMandate = z.enum(["factual_grounding","novelty_prior_art","feasibility","falsification","subtype_specific"])`. `CriticReview = z.object({id, candidateId, mandate: CriticMandate, scores: z.record(z.number()), critique: z.string(), confidence: z.number().min(0).max(1), evidenceRefs: z.array(EvidenceRef)}).strict()`. `CRITIC_INPUT_DELIMITER = "<<<CANDIDATE>>>" as const`. `CriticInput = z.object({trustedRubric: z.string(), untrustedCandidate: z.string()}).strict()` — the *shape* enforces that callers never inline candidate text into the rubric string.
- **Execution note:** test-first.
- **Patterns to follow:** U4.
- **Test scenarios:**
  - `spec(§7)` fieldset snapshot for `CriticReview` and `CriticInput`.
  - `spec(§7)` closed mandate enum: all 5 parse.
  - `spec(§14)` `CRITIC_INPUT_DELIMITER` is exported and equals `"<<<CANDIDATE>>>"`.
  - `spec(§7)` `CriticReview.confidence` outside `[0, 1]` throws.
  - `spec(§7)` `CriticReview` has no winner-selection or policy-mutation field (snapshot encodes this — adding such a field would break the snapshot, which is the intended alarm).
- **Verification:** Fieldset snapshot for `CriticReview` is exactly the 7 fields in Approach; any future addition fails the snapshot.

### U10. `CheckResult` + `CheckRunnerAdapter` allowlist shape (source: P0.7)

- **Goal:** Freeze the check-result shape and the non-executing allowlist-keyed adapter shape.
- **Requirements:** `ARCHITECTURE.md §7`, §14; REQ-S-003.
- **Dependencies:** U8 (EvidenceRef).
- **Files:**
  - Create: `packages/contracts/src/checks/check-result.ts`, `packages/contracts/src/checks/check-runner-adapter.ts`, `packages/contracts/src/checks/__tests__/check-result.fieldset.test.ts`, `packages/contracts/src/checks/__tests__/check-runner-adapter.test.ts`
  - Modify: `packages/contracts/src/index.ts`
- **Approach:** `CheckStatus = z.enum(["passed","failed","skipped"])`. `CheckResult = z.object({id, candidateId, checkType: z.string(), status: CheckStatus, score: opt(z.number()), output: opt(z.unknown()), skipReason: opt(z.string()), evidenceRefs: z.array(EvidenceRef), error: opt(z.string())}).strict().refine(r => r.status !== "skipped" || !!r.skipReason, "skipped requires skipReason")`. `CheckRunnerAdapter = z.object({id: z.string(), checkType: z.string(), capabilities: z.array(z.string()), description: z.string()}).strict()` — explicitly **no** `execute` or `command` field. The registry shape is documented as keyed by `id`; the actual registry lives in `apps/api` (Phase 4), but the per-adapter contract is frozen here.
- **Execution note:** test-first.
- **Patterns to follow:** U4.
- **Test scenarios:**
  - `spec(§7)` fieldset snapshot for `CheckResult` and `CheckRunnerAdapter`.
  - `spec(§7)` closed status: all 3 parse.
  - `spec(§7)` refinement: `{status: "skipped"}` without `skipReason` throws; `{status: "passed"}` without `skipReason` parses.
  - `spec(§14)` allowlist invariant: `CheckRunnerAdapter` has no field whose name matches `/exec|cmd|run|eval/` (snapshot-enforced; this test asserts the field-name set explicitly excludes these).
- **Verification:** Snapshot encodes the allowlist invariant.

### U11. `NoveltyScore` + `FitnessScore` + `ScoringPolicy` (source: P0.8)

- **Goal:** Freeze the scoring shapes; weight *values* are deferred-open, structure is frozen.
- **Requirements:** `ARCHITECTURE.md §8`.
- **Dependencies:** U3.
- **Files:**
  - Create: `packages/contracts/src/scoring/novelty-score.ts`, `packages/contracts/src/scoring/fitness-score.ts`, `packages/contracts/src/scoring/scoring-policy.ts`, plus three fieldset tests under `__tests__/`
  - Modify: `packages/contracts/src/index.ts`
- **Approach:** `NoveltyScore = z.object({id, candidateId, vector: z.array(z.number()), embeddingModelId: z.string(), dimension: z.number().int().positive(), comparisonSet: z.array(z.string()), method: z.string(), score: z.number(), explanation: z.string()}).strict()`. `FitnessScore = z.object({id, candidateId, total: z.number(), components: z.record(z.number()), policyVersion: z.string(), explanation: z.string()}).strict()`. `ScoringPolicy = z.object({version: z.string(), weights: z.record(z.number()), normalization: opt(z.string())}).strict()` — values intentionally not validated against a specific schema since weights are deferred-open.
- **Execution note:** test-first.
- **Patterns to follow:** U4.
- **Test scenarios:**
  - `spec(§8)` fieldset snapshots for all three.
  - `spec(§8)` `NoveltyScore.vector.length === dimension` — runtime invariant, not schema-enforceable cheaply; documented in a code comment and asserted in a single integration-style fieldset test that constructs both and checks the relationship.
  - `spec(§8)` `FitnessScore.policyVersion` is `z.string()` (ties a score to its policy version, deliberate).
  - `spec(§8)` `ScoringPolicy.weights` accepts any record-of-number (deferred-open).
- **Verification:** Snapshots committed.

### U12. `EnergyEvent` + `ReproductionEvent` (source: P0.9)

- **Goal:** Freeze the energy and reproduction event payload shapes. EnergyEvent models only **successful** productive spend.
- **Requirements:** `ARCHITECTURE.md §4`, §5, §8.
- **Dependencies:** U3.
- **Files:**
  - Create: `packages/contracts/src/reproduction/energy-event.ts`, `packages/contracts/src/reproduction/reproduction-event.ts`, plus two fieldset tests
  - Modify: `packages/contracts/src/index.ts`
- **Approach:** `EnergyEventType = z.enum(["llm","tool","spawn"])`. `EnergyEvent = z.object({id, runId, generationId: opt, agenomeId: opt, eventType: EnergyEventType, estimate: z.number().int().nonnegative(), actual: z.number().int().nonnegative(), unit: z.literal("doppl_energy"), reason: z.string(), providerMeta: opt(z.unknown())}).strict()` — no `failed`/`retried`/`repaired` field (success-only invariant). `ReproductionMode = z.enum(["fusion","crossover","output_synthesis","mutation_only"])`. `ReproductionEvent = z.object({id, runId, parentAgenomeIds: z.array(z.string()), childAgenomeId: z.string(), mode: ReproductionMode, crossoverPoints: z.array(z.string()), mutationSummary: z.string()}).strict()`.
- **Execution note:** test-first.
- **Patterns to follow:** U4.
- **Test scenarios:**
  - `spec(§4)` fieldset snapshot for `EnergyEvent` — snapshot encodes the absence of any `failed`/`retried`/`repaired` field.
  - `spec(§4)` `unit` literal: only `"doppl_energy"` parses.
  - `spec(§8)` fieldset snapshot for `ReproductionEvent`.
  - `spec(§8)` closed reproduction-mode enum: all 4 parse.
  - `spec(§3)` `mode: "mutation_only"` is a valid value (the degenerate <2-parent fallback uses it).
- **Verification:** Success-only invariant pinned by snapshot.

### U13. Per-type payload-shape map for high-traffic event types (source: P0.10)

- **Goal:** Build the `RunEventType → payload schema` map so a typed reader can narrow `RunEventEnvelope.payload` per event type, without forcing a 25-arm discriminated union at envelope level.
- **Requirements:** `ARCHITECTURE.md §4`.
- **Dependencies:** U4, U5 (redaction), U7-U12.
- **Files:**
  - Create: `packages/contracts/src/events/payloads/per-type-map.ts`, `packages/contracts/src/events/payloads/__tests__/per-type-map.test.ts`, plus individual per-type payload schemas under `packages/contracts/src/events/payloads/`
  - Modify: `packages/contracts/src/index.ts`
- **Approach:** Define narrow payload schemas for the highest-traffic types: `run.configured` (RunConfig + rngSeed), `run.started`, `run.completed`, `generation.started/completed`, `agenome.spawned/fused/mutated/reproduced`, `candidate.created`, `critic.reviewed` (CriticReview), `check.completed` (CheckResult), `novelty.scored` (NoveltyScore), `fitness.scored` (FitnessScore), `lineage.culled` (CullingEvent shape — frozen in U17), `energy.spent` (EnergyEvent), `provider_call_failed`, `output_schema_rejected`, `candidate_invalidated`, `energy_exhausted`, `generation_failed`, `reproduction_aborted_insufficient_parents`, `novelty_scoring_degraded`. The map is `const RunEventPayloadMap = { [RunEventType.Values.run_configured]: RunConfiguredPayload, ... } as const`. Export a helper `parseEventPayload(type, raw): ParsedPayload` that looks up and parses.
- **Execution note:** test-first — write the lookup happy/unknown tests first.
- **Patterns to follow:** U4.
- **Test scenarios:**
  - Happy path: every key in `RunEventType` has a payload schema in the map (assert exhaustively via `RunEventType.options.every(t => t in RunEventPayloadMap)`).
  - Happy path: `parseEventPayload("critic.reviewed", validCriticReview)` returns the parsed value.
  - Error path: `parseEventPayload("critic.reviewed", { wrong: "shape" })` throws.
  - `spec(§4)` fieldset snapshots for the per-type payloads that reference Appendix-A models inline.
  - Coverage: `failure/terminal` types (`run.failed`, `run.stopped`, `provider_call_failed`, etc.) have explicit payload schemas, even if minimal `{ reason: z.string() }`.
- **Verification:** Map keys exhaustively cover `RunEventType.options`; assertion at module load is the failsafe (a `satisfies Record<RunEventType, ZodSchema>` check at the type level).

### U14. `ModelRoute` + `ModelRole` + `ProviderCapability` (source: P0.11)

- **Goal:** Freeze the route/role/capability shapes that the model gateway will consume.
- **Requirements:** `ARCHITECTURE.md §9`.
- **Dependencies:** U3.
- **Files:**
  - Create: `packages/contracts/src/gateway/model-route.ts`, `packages/contracts/src/gateway/model-role.ts`, `packages/contracts/src/gateway/provider-capability.ts`, plus fieldset tests
  - Modify: `packages/contracts/src/index.ts`
- **Approach:** `ModelRole = z.enum(["population_generator","critic","subtype_check","embedding","final_judge","fusion_synthesis"])`. `ProviderCapability = z.object({structuredOutputs: z.boolean(), toolCalling: z.boolean(), embeddings: z.boolean(), streaming: z.boolean()}).strict()`. `ModelRoute = z.object({role: ModelRole, provider: z.string(), modelId: z.string(), capabilities: ProviderCapability, fallbackRouteIds: z.array(z.string())}).strict()`.
- **Execution note:** test-first.
- **Patterns to follow:** U4.
- **Test scenarios:**
  - `spec(§9)` fieldset snapshots for all three.
  - `spec(§9)` closed role enum: all 6 parse.
  - `spec(§9)` `ProviderCapability` has exactly 4 boolean fields (snapshot-enforced).
- **Verification:** Snapshots committed.

### U15. `ModelGatewayRequest` + `ModelGatewayResponse` (source: P0.12)

- **Goal:** Freeze the request/response wire shapes for the model gateway.
- **Requirements:** `ARCHITECTURE.md §9`.
- **Dependencies:** U14.
- **Files:**
  - Create: `packages/contracts/src/gateway/model-gateway-io.ts`, plus fieldset test
  - Modify: `packages/contracts/src/index.ts`
- **Approach:** `ModelGatewayRequest = z.object({role: ModelRole, runId, generationId: opt, agenomeId: opt, candidateId: opt, input: z.unknown(), schemaForOutput: opt(z.unknown()), timeoutMs: opt(z.number().int().positive()), correlationId}).strict()`. `ModelGatewayResponse = z.object({ok: z.boolean(), output: opt(z.unknown()), repairAttempts: z.number().int().nonnegative(), validationError: opt(z.string()), providerTraceId: opt(z.string()), langfuseObservationId: opt(z.string()), energyEstimate: z.number().int().nonnegative(), energyActual: opt(z.number().int().nonnegative())}).strict()`. `schemaForOutput` and `input` typed as `z.unknown()` because the gateway is provider-agnostic.
- **Execution note:** test-first.
- **Patterns to follow:** U4.
- **Test scenarios:**
  - `spec(§9)` fieldset snapshots.
  - Happy path: a valid request and a valid `ok: true` response parse.
  - Edge case: an `ok: false` response with `validationError` parses (rejected path).
  - Energy invariant: `energyEstimate` is required, `energyActual` is optional (post-call reconciliation may not have happened yet).
- **Verification:** Snapshots committed.

### U16. `LineageGraphProjection` schema (source: P0.13)

- **Goal:** Freeze the typed Appendix-A lineage projection model, storage-agnostic.
- **Requirements:** `ARCHITECTURE.md §6`, §9; supports React Flow rendering (`DECISIONS.md` ADR-008).
- **Dependencies:** U3.
- **Files:**
  - Create: `packages/contracts/src/projections/lineage-graph.ts`, plus fieldset test
  - Modify: `packages/contracts/src/index.ts`
- **Approach:** `LineageNodeType = z.enum(["run","generation","agenome","candidate","critic_review","check_result","scoring","reproduction"])` (the 5+ node types `IMPLEMENTATION_PLAN.md` line 1278 references; reconcile final enum against `ARCHITECTURE.md §9` table). `LineageNode = z.object({id, type: LineageNodeType, label: z.string(), status: opt(z.string()), metrics: opt(z.record(z.number())), dataRef: opt(z.string())}).strict()`. `LineageEdge = z.object({id, source: z.string(), target: z.string(), type: z.string(), label: opt(z.string())}).strict()`. `LineageGraphProjection = z.object({runId, sequenceThrough: z.number().int().nonnegative(), nodes: z.array(LineageNode), edges: z.array(LineageEdge)}).strict()`.
- **Execution note:** test-first.
- **Patterns to follow:** U4.
- **Test scenarios:**
  - `spec(§9)` fieldset snapshots for `LineageGraphProjection`, `LineageNode`, `LineageEdge`.
  - `spec(§9)` `sequenceThrough` is a non-negative integer (the watermark for projection freshness).
  - Happy path: an empty graph (`nodes: [], edges: []`) parses.
- **Verification:** Snapshots committed.

### U17. `Run` + `Generation` + `CullingEvent` + `FinalJudgeRubric` (source: P0.15)

- **Goal:** Close the Appendix-A gaps surfaced by P0.15 — these are referenced by other models (especially `CullingEvent` payload for `lineage.culled` events in U13) but are described in `docs/planning/DOMAIN_MODEL.md` rather than the original Appendix A.
- **Requirements:** `DOMAIN_MODEL.md`; `ARCHITECTURE.md` Appendix A gaps noted in P0.15.
- **Dependencies:** U3, U8 (EvidenceRef for `FinalJudgeRubric` evidence).
- **Files:**
  - Create: `packages/contracts/src/domain/run.ts`, `packages/contracts/src/domain/generation.ts`, `packages/contracts/src/domain/culling-event.ts`, `packages/contracts/src/domain/final-judge-rubric.ts`, plus fieldset tests
  - Modify: `packages/contracts/src/index.ts`, `packages/contracts/src/events/payloads/per-type-map.ts` (wire the `lineage.culled` payload to `CullingEvent` once this unit ships — same PR)
- **Approach:** Field-sets derived from `docs/planning/DOMAIN_MODEL.md`. `RunStatus = z.enum([...])` (closed; reconcile values against DOMAIN_MODEL.md run-state machine). `Run = z.object({id, status: RunStatus, configured: RunConfig, startedAt: opt, completedAt: opt, terminalSummary: opt}).strict()`. `Generation = z.object({id, runId, index: z.number().int().nonnegative(), startedAt, completedAt: opt}).strict()`. `CullingEvent = z.object({id, runId, generationId, targetIds: z.array(z.string()), reason: z.string(), scoreSnapshot: z.record(z.number())}).strict()`. `FinalJudgeRubric` = the fixed 5-axis rubric structure (axes named per `DOMAIN_MODEL.md`), version-pinned, immutable-to-agents.
- **Execution note:** test-first.
- **Patterns to follow:** U4.
- **Test scenarios:**
  - `spec(§3)` fieldset snapshots for all four.
  - `spec(§3)` `FinalJudgeRubric` has exactly 5 axes (snapshot-enforced).
  - `spec(§3)` closed run-status enum.
  - Per-type map cross-check: `RunEventPayloadMap[RunEventType.Values["lineage.culled"]]` now points at `CullingEvent`-derived payload (was a placeholder in U13; this test asserts the wiring).
- **Verification:** All snapshots committed; the per-type map's `lineage.culled` payload is no longer a placeholder.

### U18. Contract-test surface — consumer/producer payload-agreement matrix (source: P0.14)

- **Goal:** A single test matrix asserts that for each `RunEventType`, the per-type payload schema in `RunEventPayloadMap` matches what producing-track and consuming-track conventions imply. This is the freeze-verification harness.
- **Requirements:** `IMPLEMENTATION_PLAN.md` line 318-329; cross-track §2.5 invariant.
- **Dependencies:** U4 – U17 (all schemas exist).
- **Files:**
  - Create: `packages/contracts/src/__tests__/contract-surface.test.ts`, `packages/contracts/src/__tests__/payload-agreement.test.ts`
- **Approach:** Two layers. **(a) Surface completeness:** assert every Appendix-A model named in `IMPLEMENTATION_PLAN.md` Phase 0 acceptance criteria (P0 lines 330-340) is exported from `packages/contracts` and parses a representative fixture. **(b) Payload agreement:** for each `RunEventType`, hand-author a single canonical fixture for the per-type payload, run it through `parseEventPayload(type, fixture)`, and assert success. The fixture file (`__fixtures__/events.ts`) becomes the cross-track canon — when the kernel writes an `agenome.fused` event, its payload must match the fixture shape.
- **Execution note:** test-first — author fixtures first, then ensure all schemas in U4-U17 accept them. This is the final cross-check.
- **Patterns to follow:** None — this is the harness.
- **Test scenarios:**
  - **Surface completeness:** an assertion list iterates a static array of every required export name and `expect(contractsPkg).toHaveProperty(name)`.
  - **Payload agreement:** every key in `RunEventType.options` has a fixture; `parseEventPayload(type, fixtures[type])` succeeds for each.
  - **Snapshot completeness:** count of `*.fieldset.test.ts` files equals the number of Appendix-A models. (A meta-test that fails if a future model is added without a fieldset snapshot.)
  - **Redaction invariant:** every fixture passes through `redact()` and the result still parses (redaction does not break valid payloads).
  - **schemaVersion:** the envelope's `schemaVersion` field accepts values `≤ CONTRACTS_SCHEMA_VERSION` and rejects greater (forward-compat per `ARCHITECTURE.md §4`).
- **Verification:** `pnpm --filter @doppl/contracts test` runs the full contract surface in one command; the matrix is green; this is the Phase 0 acceptance gate per `IMPLEMENTATION_PLAN.md` line 330-340.

---

## Requirements Traceability

| Plan unit | IMPLEMENTATION_PLAN source | ARCHITECTURE.md anchors | Requirements / risks |
|---|---|---|---|
| U1 | (scaffold — implied) | §6 module rules | REQ-NF-001 |
| U2 | (scaffold — implied) | §6 | — |
| U3 | §16 RED outline | §2.5 | — |
| U4 | P0.1 (§157-167) | §4, Appendix A | — |
| U5 | P0.2 (§169-179) | §14 | REQ-S-004, RISK-006, RISK-009 |
| U6 | P0.3 (§181-191) | §15 | REQ-NF-001 |
| U7 | P0.4 (§193-202) | §3, Appendix A | — |
| U8 | P0.5 (§204-214) | §3, §4, §9, Appendix A | — |
| U9 | P0.6 (§216-225) | §7, §14, Appendix A | T-RISK-002 |
| U10 | P0.7 (§227-236) | §7, §14, Appendix A | REQ-S-003 |
| U11 | P0.8 (§238-248) | §8, Appendix A | — |
| U12 | P0.9 (§250-260) | §4, §5, §8, Appendix A | — |
| U13 | P0.10 (§262-271) | §4 | — |
| U14 | P0.11 (§273-282) | §9, Appendix A | — |
| U15 | P0.12 (§284-294) | §9, Appendix A | — |
| U16 | P0.13 (§296-305) | §9, §6 | ADR-008 (React Flow) |
| U17 | P0.15 (§307-316) | §3, Appendix A gaps | — |
| U18 | P0.14 (§318-328) | §2.5 freeze-verification | — |

---

## System-Wide Impact

- **All four downstream tracks (`kernel`, `verifier`, `selection`, `demo`)** depend on `@doppl/contracts` shipping; after this plan, they can fork into separate worktrees per `IMPLEMENTATION_PLAN.md` §52.
- **No application code exists yet**, so blast radius is the package itself + bootstrap. Adding a contracts dependency to apps in later plans will not break this freeze.
- **Drizzle (Phase 1)** will import Zod-derived `z.infer` types as table-column TS types; the schema field-sets here become the source of truth for the migration shape.
- **Langfuse correlation (Phase 2)** relies on `RunEventEnvelope.langfuseTraceId` / `langfuseObservationId` — those fields freeze here.
- **The custom `/orchestrate-start`, `/session-start`, `/tdd`, `/phase-exit`** slash commands are *not* invoked or modified by this plan. They can coexist or be retired in a follow-up plan (Deferred to Follow-Up Work). `IMPLEMENTATION_PLAN.md`'s `Currently in progress` / `Carry-forward` / `Log` sections will not be mutated by `ce-work` per ce-work's own discipline — git commits and the ce-work task list carry progress instead.

---

## Risks

| Risk | Mitigation |
|---|---|
| Field-set drift between this freeze and `ARCHITECTURE.md` Appendix A. | Every unit's fieldset snapshot is `spec(§X)`-tagged; a CI grep can later assert every §X-anchored field-set has a matching snapshot. Within this plan, U18's surface-completeness test is the last-mile check. |
| `DOMAIN_MODEL.md` field-sets (used by U17) diverge from any `ARCHITECTURE.md` Appendix A revisions. | Treat `DOMAIN_MODEL.md` as the source-of-truth for U17 per `IMPLEMENTATION_PLAN.md` P0.15. Flag any contradiction with ARCHITECTURE.md as a cross-doc invariant break and stop. |
| `ScoringPolicy.weights` are deferred-open — accepting any `z.record(z.number())` may let an invalid weight set ship later. | Explicit comment + plan note; the runtime fitness scorer (Phase 5) will enforce structural weight constraints in code, not at schema level. Acceptable per `ARCHITECTURE.md §8`. |
| Biome may not satisfy all preferences (e.g., team strongly prefers ESLint). | Surface as the only ambiguous tooling pick. If `ce-work` execution surfaces objection, swap to `eslint + prettier` in U1 — units U2+ are unaffected. |
| Per-type payload map (U13) becomes a sprawling 25-arm registry. | Keep one file per payload schema under `events/payloads/`; the map itself is a small barrel. The `satisfies Record<RunEventType, ZodSchema>` type check is the exhaustiveness pin. |
| `Run`/`Generation`/`CullingEvent`/`FinalJudgeRubric` field-sets in `DOMAIN_MODEL.md` are less rigorously specified than the original Appendix A entries. | Read `DOMAIN_MODEL.md` carefully during U17; surface any genuinely-missing field in a `Deferred to Implementation` note rather than inventing fields. |

---

## Deferred to Implementation

These are intentionally not resolved here; the implementing agent will decide during U-execution.

- **Exact value list of `RunStatus`** for U17 — pull from `DOMAIN_MODEL.md` at execution; if ambiguous, surface as a blocker before sealing the snapshot.
- **Exact `LineageNodeType` enum members** for U16 — `IMPLEMENTATION_PLAN.md` line 1278 says "five custom node types" but the canonical list is in `ARCHITECTURE.md §9`. Implementer reconciles.
- **`personaWeights` shape** in U7 — `z.record(z.number())` is the conservative pick; if `ARCHITECTURE.md §3` pins specific keys, narrow it.
- **Whether `Biome` or `ESLint+Prettier`** is the final lint stack (see Risks).
- **Whether `vitest`'s snapshot files are committed inline or to `__snapshots__/` directories** — Vitest default is `__snapshots__/`; keep default.
- **Exact `RunEventType` string values for the 21 enumerated types** — `IMPLEMENTATION_PLAN.md` line 161 lists them in dot.notation form; verify they match `DATA_MODEL.md`'s enumeration verbatim (the plan lists 21; `DATA_MODEL.md` per the explore agent has 19 — reconcile during U4).

---

## Verification

Phase 0 is complete (and this plan is shipped) when all of the following pass from a fresh clone:

1. `pnpm install` succeeds; `pnpm -w typecheck && pnpm -w lint && pnpm -w test` exit 0.
2. `pnpm --filter @doppl/contracts test` runs every `*.fieldset.test.ts` and the contract-surface harness from U18; all snapshots committed.
3. Every Appendix-A model named in `IMPLEMENTATION_PLAN.md` lines 330-340 is exported from `@doppl/contracts` and has a fieldset snapshot.
4. The redaction round-trip property holds for every event-payload fixture in U18 (`redact(fixture)` still parses).
5. A grep for `z.passthrough()` returns zero results under `packages/contracts/src/` (every top-level model uses `.strict()`); a grep for `.refine` is bounded to the cases the plan calls out (U10's skip-reason refinement, etc.).
6. `IMPLEMENTATION_PLAN.md` Phase 0 acceptance criteria (lines 330-340) are met: every checkbox under "Acceptance criteria (P0)" can be ticked by inspection of the contracts package.

When U1 – U18 ship, the four downstream tracks (`kernel`, `verifier`, `selection`, `demo`) can fork into worktrees per `IMPLEMENTATION_PLAN.md` §52 and begin Phase 1, 4, 5, 6 work in parallel.
