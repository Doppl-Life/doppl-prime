# /tdd brief — get_problem_sets_route

## Feature
A read-only `GET /problem-sets` route that returns the boot prepared-problem catalog (`config.problemSets`) so the PD.5b operator panel can populate its prepared-problem selector (the catalog is boot-only today — no REST exposure). The PD.5a half of PD.5. ZERO new contract surface (`ProblemSet` is an existing runtime config schema; this is a read projection), no state mutation.

## Use case + traceability
- **Task ID:** PD.5
- **Architecture sections it implements:** `ARCHITECTURE.md §11` (backend API & flows — read endpoints over projections/config), `ARCHITECTURE.md §17` (the demo prepared-problem path). This is the **PD.5a (api) half**; PD.5b (web `OperatorPromptPanel`) consumes it.
- **Related context:** PD.10 made the per-run `seed` shape generation, so a selected prepared problem (its `prompt` → `RunConfig.seed`) has real effect. `POST /runs` already deep-merges a partial `{seed}` body against `defaultConfig` (`validateRunConfig`, verified) — so PD.5b POSTs a partial `{seed}` and no api config-builder is needed (`demo-run-config.ts` was dropped). `ProblemSet` = `{id, title, prompt}` + `DEFAULT_PROBLEM_SETS` live in `apps/api/src/runtime/config/configSchema.ts`; the boot loads them into `config.problemSets`. `buildServer` (`apps/api/src/server.ts`) currently has no `problemSets` dep — this slice threads it.

## Acceptance criteria (what "done" means)
- [ ] `GET /problem-sets` → `200 { problemSets: ProblemSet[] }` deep-equal to the boot catalog passed at `buildServer` (each entry `{id, title, prompt}`).
- [ ] Read-only: the route appends NO event + mutates NO state (the event store is untouched); repeated GETs return the same catalog (idempotent).
- [ ] An empty catalog → `200 { problemSets: [] }` (not a 404 — an empty catalog is a valid state, not an error).
- [ ] The catalog is threaded via `buildServer` deps (wired from `main.ts` `config.problemSets`) — not read from a module global (testable injection).
- [ ] Reachable from a production entry point: registered in `server.ts`, wired in `main.ts`.
- [ ] `/preflight` clean.

## Wiring / entry point (Step 7.5)
`apps/api/src/server.ts` `buildServer` registers the route (a new `registerProblemSetsRoutes(app, { problemSets })`); `apps/api/src/main.ts` passes `config.problemSets` into `buildServer`. Reachable as `GET /problem-sets`; consumed by **PD.5b** (the web panel fetches it to populate the prepared-problem selector). Confirm via `/wired problem-sets` (main.ts → buildServer → the route).

## Files expected to touch
**New:**
- `apps/api/src/routes/problem-sets.ts` — `registerProblemSetsRoutes(app, deps)` + the `GET /problem-sets` handler.
- `apps/api/test/integration/routes/problem-sets.test.ts` (real Fastify; or a unit route test per the existing routes-test convention).

**Modified:**
- `apps/api/src/server.ts` — `BuildServerDeps.problemSets: ProblemSets` (or the minimal shape) + call `registerProblemSetsRoutes`.
- `apps/api/src/main.ts` — pass `config.problemSets` into `buildServer`.

If implementation needs files beyond this list, **flag at Step 2.5**.

## RED test outline (Step 2)
1. **`get_problem_sets_returns_boot_catalog`** — Asserts: `GET /problem-sets` → 200; `body.problemSets` deep-equals the injected catalog (id/title/prompt). Why: §11/§17 — expose the catalog.
2. **`get_problem_sets_is_read_only`** — Asserts: after the GET, the event store has no new event (read-only); a repeated GET returns the same catalog. Why: §11 — read endpoints never mutate authoritative state (rule #2).
3. **`get_problem_sets_empty_catalog`** — Asserts: an empty injected catalog → 200 `{ problemSets: [] }` (not 404). Why: an empty catalog is a valid state.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none. `ProblemSet` is an existing runtime config schema (not an Appendix-A/`@doppl/contracts` model); the route is a read projection of boot config. ZERO new contract surface.
- **Orchestrator doc rows to write hot (Step 9 routing):** none expected. A likely **Architecture-doc note** (§11): `GET /problem-sets` exposes the boot prepared-problem catalog (read-only). Routed to phase-d's `ARCHITECTURE.md` copy.
- **§2.5-seam model touched?** No.

## Things to flag at Step 2.5
1. **Response shape: `{ problemSets: [...] }` (envelope) vs a bare array?** My default vote: **`{ problemSets: [...] }`** — an object envelope leaves room to add metadata later + matches the read-endpoint convention.
2. **How the route gets the catalog: a `buildServer` dep vs a config global?** My default vote: **thread `problemSets` via `BuildServerDeps`** (wired from `main.ts` `config.problemSets`) — testable injection, no module global.
3. **Expose the full `ProblemSet` (incl. `prompt`) or just `{id, title}`?** My default vote: **full `{id, title, prompt}`** — the web needs the `prompt` to fill `RunConfig.seed` on selection; it's non-sensitive curated demo content. (No secret/redaction concern — these are authored problem statements.)

## Dependencies + sequencing
- **Depends on:** the existing boot `config.problemSets` + `buildServer`. (Independent of PD.10 — but PD.10 is what makes a selected problem meaningful.)
- **Blocks:** PD.5b (the web `OperatorPromptPanel` fetches `GET /problem-sets`).

## Estimated commit count
**1.** A small read-only route + its wiring — one cohesive slice. Not safety-touching (read-only projection of non-sensitive config); security-reviewer = phase-boundary (no per-slice review needed). NOT bundled with PD.5b (different code area — web).

## Lessons-logged candidates anticipated
- **Architecture-doc note candidate** — §11: `GET /problem-sets` is the read projection of the boot prepared-problem catalog (the only new demo read endpoint; everything else reuses existing routes).
- (Likely no convention candidate — a standard read route.)

## How to invoke
1. **Read this brief end-to-end** (3 Step-2.5 questions, pre-voted).
2. **Run `/tdd get_problem_sets_route`**.
3. **Step 0 (Restate)** — a read-only catalog route; zero new contract surface; threaded via buildServer deps.
4. **Step 1 (Identify files)** — confirm against "Files expected to touch."
5. **Step 2.5** — test-design + coverage map + the 3 answers.
6. **Step 9** — surface anything beyond the anticipated candidates.

> **CWD — CRITICAL (Bash cwd RESETS each call):** Read/Edit/Write → ABSOLUTE paths under `/Users/dreddy/Documents/GauntletAI/Capstone-phased/`; TESTS → `pnpm -C /Users/dreddy/Documents/GauntletAI/Capstone-phased/apps/api test ...` (a bare `pnpm test` runs the KERNEL worktree = FALSE GREEN); git → `git -C /Users/dreddy/Documents/GauntletAI/Capstone-phased ...`; branch-check `== phase-d` before the first edit AND the Step-10 commit.
