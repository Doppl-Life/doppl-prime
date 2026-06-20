# Doppl `apps/web/` — Build Guide

> **You're in `apps/web/`.** This file plus root `CLAUDE.md` both load. The root file covers global project conventions + shared comm rules (track-prefix, escalation taxonomy, messaging budget); this file owns code-area conventions for the React dashboard.

## Launch protocol

| Working on... | cwd | Loads |
|---|---|---|
| Planning / docs / commits | repo root (`Capstone/`) | root `CLAUDE.md` only |
| the React dashboard code | `apps/web/` | this `CLAUDE.md` + root |
| the backend (Doppl kernel + subsystems) code | `apps/api/` | `apps/api/CLAUDE.md` + root |

If you find yourself fighting the wrong conventions, check your cwd.

## Session start/end protocol

**At session start:**
1. Read `IMPLEMENTATION_PLAN.md` (repo root) **by section, not whole** — `grep -n "^##" IMPLEMENTATION_PLAN.md` for offsets, then Read with offset/limit just "Currently in progress" + the active phase. (The file grows; never load it whole.)
2. Confirm with the user what feature this session is targeting.
3. Read the relevant section of `ARCHITECTURE.md` from the lookup table below.

**At session end** (only when the user explicitly says we're done):

1. **Implementer runs `/session-end`.** Implementer writes ONLY:
   - `apps/web/` code files (the slice's implementation)
   - test files (the slice's tests)
   - dependency manifest / lockfile (deps the slice adds)
   - `docs/sessions/<NNN>-<date>-<topic>.md` (session doc, created at `/session-end` Step 5)

   **Implementer must NOT touch (all orchestrator territory).** *This list is the canonical statement
   of the territory rule — `/session-end`, the brief template, and the generated
   `scripts/guards/territory-guard.sh` PreToolUse hook (which mechanically enforces it in team mode)
   all point here.*
   - `IMPLEMENTATION_PLAN.md`
   - `apps/web/LESSONS.md`
   - `apps/web/CLAUDE.md` (entire file — both the Cross-doc invariants table AND the Lessons logged index)
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
| Frontend dashboard (panels, live/replay, React Flow, accessibility) | `ARCHITECTURE.md` | §12 |
| Lineage graph & LineageGraphProjection | `ARCHITECTURE.md` | §10 |
| Backend API & flows (REST endpoints, SSE, resume, health) | `ARCHITECTURE.md` | §11 |
| Lessons logged (full prose) | `apps/web/LESSONS.md` | by lesson # |

<!-- Starts near-empty. Add a row whenever a topic is looked up twice. -->

**Code intelligence & docs (when available):** prefer a code-intelligence MCP / docs MCP over grep+read loops — see root `CLAUDE.md` "Code intelligence & docs."

## Stack

<!-- ▼ EXAMPLE BLOCK [id=area-stack]: stack quick-reference for implementer sessions. Canonical stack lives in root CLAUDE.md + ARCHITECTURE.md; this is the cheat sheet. ▼ -->

- **Runtime:** Node 22 LTS (pnpm workspace)
- **Framework:** React 19 + Vite (React Flow for the lineage graph)
- **Validation:** Zod (shared schemas from `packages/contracts` — consumed read-only)
- **Lint / types / tests:** ESLint / `tsc --noEmit` (strict) / Vitest (unit) + Playwright (e2e happy-path smoke)

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

**Write the failing test first.** Applies to deterministic code — see the TDD posture in root `CLAUDE.md`. For the dashboard, that means: the REST/SSE client, the sequence-keyed resync reducer, the projection→view mapping, and the accessible-status primitive are unit-test-first; the end-to-end render is covered by **one Playwright happy-path smoke** (start → live events → final-idea links resolve).

**Commit per slice when practical.** Never bundle a safety-critical slice with anything else.

## Forbidden patterns

<!-- ▼ EXAMPLE BLOCK [id=forbidden-patterns]: forbidden patterns — 3-5 narrow, enforceable, domain-specific rules. Shape: "Don't <pattern X> because <reason / past incident>; use <alternative Y>." Test-pin them where possible. Starts small; accretes as lessons surface. ▼ -->

Do not:

1. **Write code without a failing test first** (for deterministic code). Even one-line functions.
2. **Mutate authoritative runtime state from the dashboard** — the UI is read-only; all commands go through the REST endpoints (safety rule 2; `ARCHITECTURE.md` §12).
3. **Treat the SSE stream as the source of truth** — SSE is delivery only; resync from the last `sequence` (`lastEventId`) or poll the projection (safety rule 2).
4. **Encode a status by color alone** — every status uses shape + label + icon (colorblind-safe, projector-legible) — the dashboard is an acceptance surface shown to a room (`ARCHITECTURE.md` §12).
5. **Fetch or render a provider key / secret in the client** — server-side only (safety rule 4).
6. **Import backend internals (`apps/api/**`)** — the dashboard reads projections through the typed API/SSE client; it shares only `packages/contracts` types.

**Enforcement patterns (machine-readable — `/preflight` warn-greps the staged diff against these).**
One `grep -E` (or `ast-grep`) expression per line, each tied to a numbered rule above. Rules that can't
be expressed as a pattern carry a `pin:` (test ref) or `accepted:` note on the rule itself instead.

```forbidden-patterns
# rule 6 (no backend-internals import): from ['"].*apps/api/
# rule 4 (no color-only status): pin: accessible-status primitive test (shape+label+icon)
# rule 3 (resync from sequence): pin: SSE reducer test — reorders/resyncs by sequence
```

<!-- ▲ END EXAMPLE BLOCK [id=forbidden-patterns] ▲ -->

## Cross-doc invariants — schema/docs mirroring

Several typed models in this codebase are **contracts** mirrored in `ARCHITECTURE.md` and indexed in the table below. The architecture doc is the canonical contract; the model is the executable enforcement. Drift produces silent disagreement.

**Authoring discipline (orchestrator owns this table).** The implementer never edits this table or `ARCHITECTURE.md` directly — it flags a field add/remove/rename at Step 9 as a `Cross-doc invariant change`; the orchestrator writes the row + the arch edit hot the same round (see root `CLAUDE.md` + `docs/orchestrator-briefing.md`). Commits stagger; the working tree stays aligned within the round.

| Model | `ARCHITECTURE.md` section | Notes |
|---|---|---|
| <model> | §X | <field summary> |

<!-- Starts empty. The dashboard consumes LineageGraphProjection + the projection read models (frozen in packages/contracts, ARCHITECTURE.md Appendix A); the orchestrator adds a row here as each consumed contract lands. -->

## Module organization

<!-- ▼ EXAMPLE BLOCK [id=module-layout]: module layout + layer dependency rule. Replace with the project's real directory tree and import-direction DAG. ▼ -->

```
apps/web/
  src/
    lib/                  # REST + SSE client over the typed contracts; sequence-keyed resync reducer
    components/
      lineage/            # React Flow lineage tree (custom node types: agenome/candidate/critic-check/score/winner)
      run/                # run-config panel, stop control, live/replay mode indicator
      evidence/           # critic gauntlet, subtype-check, energy, fitness-over-time, final-idea proof panels
    routes/               # dashboard shell + route composition
  test/{unit,e2e}/
```

Layer dependency direction (top depends on bottom, never reverse):

```
routes → components → lib (API/SSE client) → packages/contracts (types only)
```

The dashboard never imports `apps/api` internals; it reads projections through `lib/`. Enforce with a boundary lint where possible — the test *is* the spec for the rule.

<!-- ▲ END EXAMPLE BLOCK [id=module-layout] ▲ -->

## Subagents

See `.claude/agents/README.md` for the canonical inventory + integration points.

<!-- ▼ EXAMPLE BLOCK [id=area-subagent-candidates]: area-specific subagent candidates — list candidates that would earn their keep specifically in this area (e.g. an ABI/types syncer for a frontend area, a Pyth/feed verifier for a contracts area). Build only on real friction. ▼ -->

Candidates (build only on real friction):
- **contracts-types syncer** — when a `packages/contracts` model changes, check the dashboard's projection-consuming components + the API-client types moved with it.
- **a11y/projector linter** — assert status encodings carry shape+label+icon (not color alone) and meet contrast for projector legibility (safety/UX rule 4).

<!-- ▲ END EXAMPLE BLOCK [id=area-subagent-candidates] ▲ -->

## Lessons logged from prior sessions

The full prose for each lesson lives in `apps/web/LESSONS.md`. This index is the compact orientation surface.

**Lesson numbers are stable IDs** — once assigned, they don't change. New lessons get the next sequential number. `/session-end` proposes additions when it detects them; the user approves before the entry is written and a row is added here.

Lessons start at §1.

| # | Date | Topic | Rule (one-liner) |
|--:|---|---|---|
| | | | |

<!-- Starts empty. Each row links to its `LESSONS.md` anchor. -->
