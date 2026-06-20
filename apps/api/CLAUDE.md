# Doppl `apps/api/` — Build Guide

> **You're in `apps/api/`.** This file plus root `CLAUDE.md` both load. The root file covers global project conventions + shared comm rules (track-prefix, escalation taxonomy, messaging budget); this file owns code-area conventions for the backend (Doppl kernel + subsystems).

## Launch protocol

| Working on... | cwd | Loads |
|---|---|---|
| Planning / docs / commits | repo root (`Capstone/`) | root `CLAUDE.md` only |
| the backend (Doppl kernel + subsystems) code | `apps/api/` | this `CLAUDE.md` + root |
| the React dashboard code | `apps/web/` | `apps/web/CLAUDE.md` + root |

If you find yourself fighting the wrong conventions, check your cwd.

## Session start/end protocol

**At session start:**
1. Read `IMPLEMENTATION_PLAN.md` (repo root) **by section, not whole** — `grep -n "^##" IMPLEMENTATION_PLAN.md` for offsets, then Read with offset/limit just "Currently in progress" + the active phase. (The file grows; never load it whole.)
2. Confirm with the user what feature this session is targeting.
3. Read the relevant section of `ARCHITECTURE.md` from the lookup table below.

**At session end** (only when the user explicitly says we're done):

1. **Implementer runs `/session-end`.** Implementer writes ONLY:
   - `apps/api/` code files (the slice's implementation)
   - test files (the slice's tests)
   - dependency manifest / lockfile (deps the slice adds)
   - `docs/sessions/<NNN>-<date>-<topic>.md` (session doc, created at `/session-end` Step 5)

   **Implementer must NOT touch (all orchestrator territory).** *This list is the canonical statement
   of the territory rule — `/session-end`, the brief template, and the generated
   `scripts/guards/territory-guard.sh` PreToolUse hook (which mechanically enforces it in team mode)
   all point here.*
   - `IMPLEMENTATION_PLAN.md`
   - `apps/api/LESSONS.md`
   - `apps/api/CLAUDE.md` (entire file — both the Cross-doc invariants table AND the Lessons logged index)
   - `ARCHITECTURE.md`
   - `docs/orchestrator-briefing.md` / `docs/tdd-brief-template.md` / `docs/briefs/` / `docs/runbooks/`
   - other top-level deliverable / design docs
   - `.gitignore` and root-level dotfiles (unless adding a new artifact to ignore, flagged at Step 9)

   At Step 10: **explicit `git add <path>` per slice file; never `git add -A`/`.`; never stage an orchestrator-territory file.** Changes to any orchestrator-territory file (a new cross-doc model, a lesson, an arch note) are **flagged at Step 9**, not edited here — the orchestrator writes them hot (root `CLAUDE.md` + the Step-9 matrix).

2. **Orchestrator runs `/orchestrate-end`** for round close-out + Carry-forward triage + round terminal commit + push.

## Lookup table — where to find canonical info

Don't paste these sections into the prompt. Grep the file:section, read only what you need. `/check-arch <topic>` dispatches off this table.

| Topic | File (relative to repo root) | Section |
|---|---|---|
| Contracts & event model (RunEventEnvelope, RunEventType, energy unit, replay/RNG) | `ARCHITECTURE.md` | §4 |
| Runtime kernel (state machines, caps, energy ledger, worker, crash-forward) | `ARCHITECTURE.md` | §5 |
| Model gateway & provider integration (registry, OpenRouter, embeddings, retrieval) | `ARCHITECTURE.md` | §6 |
| Verifier council & checks (held-out judge, rotation, allowlist, injection isolation) | `ARCHITECTURE.md` | §7 |
| Selection, scoring & reproduction (fitness, novelty, fusion, mutation) | `ARCHITECTURE.md` | §8 |
| Persistence & projections (Postgres, migrations, replay reader, embeddings) | `ARCHITECTURE.md` | §9 |
| Lessons logged (full prose) | `apps/api/LESSONS.md` | by lesson # |

<!-- Starts near-empty. Add a row whenever a topic is looked up twice. (Seeded with the backend's load-bearing § anchors — this area touches most subsystems.) -->

**Code intelligence & docs (when available):** prefer a code-intelligence MCP / docs MCP over grep+read loops — see root `CLAUDE.md` "Code intelligence & docs."

## Stack

<!-- ▼ EXAMPLE BLOCK [id=area-stack]: stack quick-reference for implementer sessions. Canonical stack lives in root CLAUDE.md + ARCHITECTURE.md; this is the cheat sheet. ▼ -->

- **Runtime:** Node 22 LTS (pnpm workspace)
- **Framework:** Fastify (REST commands/queries + SSE run-event stream)
- **Validation:** Zod (shared schemas from `packages/contracts`; `z.infer` for types)
- **Persistence:** Drizzle + Postgres (append-only `run_events`; pgvector optional)
- **Lint / types / tests:** ESLint / `tsc --noEmit` (strict) / Vitest (unit + integration against a real Postgres)

<!-- ▲ END EXAMPLE BLOCK [id=area-stack] ▲ -->

## Standard commands

```bash
# Install deps (run once; re-run when the manifest changes)
pnpm install

# Run the dev server (if applicable)
pnpm dev

# Tests
pnpm test

# Quality
pnpm lint
pnpm format:check
pnpm typecheck

# Preflight (use before saying "done" with a feature)
pnpm lint && pnpm typecheck && pnpm test
```

## TDD protocol

**Write the failing test first.** Applies to deterministic code — see the TDD posture in root `CLAUDE.md` for what is test-first vs. exempt (the LLM-driven generation/critics/judge are eval-tested via `/eval`, not `/tdd`).

**Commit per slice when practical.** Never bundle a safety-critical slice with anything else.

## Forbidden patterns

<!-- ▼ EXAMPLE BLOCK [id=forbidden-patterns]: forbidden patterns — 3-5 narrow, enforceable, domain-specific rules. Shape: "Don't <pattern X> because <reason / past incident>; use <alternative Y>." Test-pin them where possible. Starts small; accretes as lessons surface. ▼ -->

Do not:

1. **Write code without a failing test first** (for deterministic code). Even one-line functions.
2. **Import a provider SDK (openai, @anthropic, openrouter, …) into a domain/runtime module** — vendor-couples the kernel, breaks replay, and is untestable; route through the `ModelGateway` port (safety rule 9).
3. **Enforce a cap or permission in prompt text** — a prompt can be ignored or injected; caps are kernel invariants enforced in the runtime (safety rule 1).
4. **Write to `run_events` outside the append-only writer** — bypasses the per-run `sequence`, the redaction scrub, and schema validation (safety rules 2, 4).
5. **Re-call a model / embedding / web provider on the replay path** — persist the outcome at run time; replay reads it (safety rule 7).
6. **Treat a projection as authoritative** — projections are derived; write the event, then rebuild the projection (safety rule 2).

**Enforcement patterns (machine-readable — `/preflight` warn-greps the staged diff against these).**
One `grep -E` (or `ast-grep`) expression per line, each tied to a numbered rule above. Rules that can't
be expressed as a pattern carry a `pin:` (test ref) or `accepted:` note on the rule itself instead.

```forbidden-patterns
# rule 2 (no provider SDK in domain/runtime): from ['"](openai|@anthropic-ai|openrouter)
# rule 4 (no raw event-table writes): (insert|update|delete).*run_events
# rule 1: pin: every slice opens with a failing test (Step 3); enforced by /tdd, not grep
# rule 3: pin: cap-enforcement tests in apps/api/test (kernel rejects over-cap spawn)
```

<!-- ▲ END EXAMPLE BLOCK [id=forbidden-patterns] ▲ -->

## Cross-doc invariants — schema/docs mirroring

Several typed models in this codebase are **contracts** mirrored in `ARCHITECTURE.md` and indexed in the table below. The architecture doc is the canonical contract; the model is the executable enforcement. Drift produces silent disagreement.

**Authoring discipline (orchestrator owns this table).** The implementer never edits this table or `ARCHITECTURE.md` directly — it flags a field add/remove/rename at Step 9 as a `Cross-doc invariant change`; the orchestrator writes the row + the arch edit hot the same round (see root `CLAUDE.md` + `docs/orchestrator-briefing.md`). Commits stagger; the working tree stays aligned within the round.

| Model | `ARCHITECTURE.md` section | Notes |
|---|---|---|
| <model> | §X | <field summary> |

<!-- Starts empty. The freeze-first contracts land in Phase 0 (packages/contracts); the orchestrator adds a row here as each contract model is consumed by apps/api. Canonical inventory: ARCHITECTURE.md Appendix A. -->

## Module organization

<!-- ▼ EXAMPLE BLOCK [id=module-layout]: module layout + layer dependency rule. Replace with the project's real directory tree and import-direction DAG. ▼ -->

```
apps/api/
  src/
    runtime/          # kernel: state machines, caps, energy ledger, RNG, generation loop, worker
    event-store/      # append-only writer (sequence + redaction + txn), migrations, replay reader
    model-gateway/    # ModelGateway port + provider adapters (OpenRouter, OpenAI embeddings, retrieval)
    verifier/         # critic council, held-out judge, critic rotation, injection isolation
    check-runners/    # allowlisted non-executing subtype check adapters
    selection/        # scoring, novelty, fitness, cull/parent-select, fusion, mutation
    projections/      # event-fold read models (current-state, lineage, replay summaries)
    routes/           # Fastify REST commands/queries + SSE stream + /runs/:id/health
  test/{unit,integration}/
```

Layer dependency direction (top depends on bottom, never reverse):

```
routes → projections → selection / verifier / check-runners → runtime → { event-store, model-gateway(port) } → packages/contracts
```

- Domain/runtime imports **only** `packages/contracts` + infrastructure ports — never a provider SDK, the frontend, or a projection read model.
- Provider adapters may import vendor SDKs; everything else sees only the `ModelGateway` port + `ProviderCapability`.

Cross-cutting layers can be imported from anywhere. Enforce the rule mechanically with a test where possible — the test *is* the spec for the rule (a dependency-cruiser/eslint boundary lint over §2.5 import rules).

<!-- ▲ END EXAMPLE BLOCK [id=module-layout] ▲ -->

## Subagents

See `.claude/agents/README.md` for the canonical inventory + integration points.

<!-- ▼ EXAMPLE BLOCK [id=area-subagent-candidates]: area-specific subagent candidates — list candidates that would earn their keep specifically in this area (e.g. an ABI/types syncer for a frontend area, a Pyth/feed verifier for a contracts area). Build only on real friction. ▼ -->

Candidates (build only on real friction):
- **event-schema/snapshot syncer** — when an Appendix-A model field changes, check the schema-snapshot test + the projection columns + the per-type payload map all moved together.
- **cap-invariant fuzzer** — generate over-cap spawn/energy/depth requests and assert the kernel fails closed (safety rule 1).

<!-- ▲ END EXAMPLE BLOCK [id=area-subagent-candidates] ▲ -->

## Lessons logged from prior sessions

The full prose for each lesson lives in `apps/api/LESSONS.md`. This index is the compact orientation surface.

**Lesson numbers are stable IDs** — once assigned, they don't change. New lessons get the next sequential number. `/session-end` proposes additions when it detects them; the user approves before the entry is written and a row is added here.

Lessons start at §1.

| # | Date | Topic | Rule (one-liner) |
|--:|---|---|---|
| | | | |

<!-- Starts empty. Each row links to its `LESSONS.md` anchor. -->
