# /tdd brief — web_data_client_seam

## Feature
Stand up **`apps/web`** (Vite + React 19 + TS-strict + Vitest + ESLint/prettier, mirroring the workspace toolchain — the package is unscaffolded) and build **P7.1**: the **read-only REST + SSE data client** over the typed `@doppl/contracts` schemas. Every projection read and every SSE event is **Zod-validated before it reaches view state** (the UI never trusts an unvalidated server payload); the client exposes **ONLY** the §11 contract endpoints + the two idempotent commands; SSE is **ordered + de-duplicated by per-run `sequence` ALONE** (never `occurredAt`), carries `lastEventId` for resume, and is **non-authoritative delivery only**; a schema-validation failure surfaces as a **typed error** (never corrupts view state). Built + tested against **FIXTURE projections + injected transport doubles** — it does **NOT** wait on the live backend (real SSE/projection wiring happens at integration).

## Use case + traceability
- **Task ID:** P7.1 (REST + SSE data client over typed contracts — read-only seam) **+ the slice-0 `apps/web` bootstrap** (folded in; the package doesn't exist yet — same bootstrap-with-first-slice pattern the kernel track used)
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (the dashboard consumes REST projections + SSE and **NEVER mutates authoritative state**; the only writes are the two idempotent commands), `§11` (REST endpoints + **SSE delivery-only**, client resumes from `lastEventId`/`sequence`, polling/replay fallback), `§10` (consumes the storage-agnostic `LineageGraphProjection` read-only).
- **Related context:** key safety rules **#2** (UI read-only; SSE non-authoritative — resync from `sequence`, never treat the stream as truth) and **#9** (frontend read-only over projections; never import `apps/api` internals; never ship provider keys to the client; **Zod-validate every boundary**). Consumes frozen `RunEventEnvelope`/`RunEventType`/`RunConfig`/`RunCaps`/`CandidateIdea`/`LineageGraphProjection`/`ModelRoute` (P0.1/P0.11/P0.13/P0.3/P0.5). Greenfield toolchain mirrors the workspace conventions (apps/api lesson L2, adapted for the Vite/React frontend). **Unit-only** (pure client logic + injected transport doubles + a render smoke; the Playwright e2e smoke is P7.15).

> **TWO IMPLEMENTERS, ONE WORKTREE (critical — lead directive).** `demo-observability-implementer` is concurrently working `apps/api` + `packages/observability` in this same `track/demo` worktree. At Step 10 you **stage ONLY your area** — `git add apps/web/<files>` (+ the single `packages/contracts/src/index.ts` line **iff** you must add a missing export) — **never `git add -A`/`.`**, never an `apps/api`/`packages/observability` file. Impls coordinate through the orchestrator, never impl↔impl.

## Acceptance criteria (what "done" means)
- [ ] **Bootstrap:** `apps/web` is a Vite + React 19 + TS-strict app with Vitest + ESLint + prettier, mirroring the workspace toolchain; the `apps/*` glob picks it up, `pnpm install` links it, and `pnpm --filter @doppl/web typecheck`/`lint`/`test` are green
- [ ] **Render smoke:** the React 19 app shell mounts and renders (proves the toolchain end-to-end)
- [ ] **Typed seam:** `apps/web/src/data/contracts.ts` re-exports the needed `@doppl/contracts` schemas (the UI imports schemas through this single seam, **never redefines** them — lesson L5 spirit); `packages/contracts/src/index.ts` is extended **only if** a needed schema isn't already exported (verify first — most already are)
- [ ] **Endpoint allowlist:** `runClient` exposes ONLY the contract endpoints (`GET /runs`, `/runs/:id`, `/runs/:id/events`, `/runs/:id/lineage`, `/runs/:id/replay`, `/runs/:id/health`, `/runs/:id/candidates/:cid`, `/model-routes`) + the two idempotent commands (`POST /runs`, `POST /runs/:id/stop`) — no arbitrary URL/method representable
- [ ] **Validate-at-boundary:** every projection read is parsed through its Zod schema before returning; an invalid payload yields a **typed error**, never a raw throw or corrupt view state, and the run stays inspectable via the REST projections
- [ ] **Sequence-only ordering:** `sseStream` orders + de-dupes events by per-run monotonic `sequence` ALONE; an event whose `sequence ≤` the last applied is **dropped**, never reordered by `occurredAt`
- [ ] **Resume watermark:** `sseStream` carries `lastEventId == last applied sequence` so a reconnect resumes from that watermark; SSE is treated as **non-authoritative delivery only** — dropping the stream loses no authoritative state (a REST/replay resync reaches the same view)
- [ ] **Fixture-driven:** built + tested against FIXTURE projections + **injected transport doubles** (fake `fetch` / fake `EventSource`); **no live-backend dependency** — real wiring is integration-time
- [ ] **Boundaries:** no `apps/api` internals imported (rule #9 / forbidden #6, structural test); no provider key fetched/rendered in the client (rule #4 / forbidden #5)
- [ ] Unit tests pass; `/preflight` (web) clean

## Wiring / entry point (Step 7.5)
**Entry point — the Vite app** (`apps/web/src/main.tsx` → `App.tsx`) mounts (covered by the render smoke). The **data-client seam's first consumer is P7.2** (the run store / view-state reducer) and thereafter every panel via `lib/`/`data/`; the **real HTTP/SSE wiring to the P6 backend endpoints is integration-time** (this slice drives the client against fixtures + injected transport). So: *entry — the app shell renders; the data client's first consumer is P7.2; real backend wiring at integration.*

## Files expected to touch
**New (bootstrap):**
- `apps/web/package.json` — `@doppl/web` (react@19, react-dom@19, vite, @vitejs/plugin-react, vitest, a DOM env for the render smoke, eslint, prettier, typescript; **depends on `@doppl/contracts`**)
- `apps/web/vite.config.ts`, `apps/web/tsconfig.json` (+ `tsconfig.node.json` if the toolchain needs it), `apps/web/eslint.config.*`, `apps/web/index.html`
- `apps/web/src/main.tsx`, `apps/web/src/App.tsx` — the app shell
- `apps/web/test/unit/app-shell.test.tsx` — render smoke

**New (P7.1):**
- `apps/web/src/data/contracts.ts` — re-export of the needed `@doppl/contracts` schemas
- `apps/web/src/data/runClient.ts` — typed REST client (endpoint allowlist + Zod-validate-on-read)
- `apps/web/src/data/sseStream.ts` — SSE consumer (sequence-only order/dedupe, `lastEventId` resume, non-authoritative)
- `apps/web/test/unit/data/runClient.test.ts`, `apps/web/test/unit/data/sseStream.test.ts`
- `apps/web/test/fixtures/` — web-local fixtures only for shapes not in `@doppl/contracts` `CANONICAL_FIXTURES` (e.g. a multi-node `LineageGraphProjection`)

**Modified (flag at Step 9 if touched — shared file):**
- `packages/contracts/src/index.ts` — **only if** a web-needed schema isn't already exported (verify first; `lineage-graph` + the envelope/config/candidate/model-route schemas are already exported).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

**`apps/web/test/unit/data/runClient.test.ts`** (`spec(§11)`/`spec(§12)`):
1. **`test_parses_valid_projection_through_zod`** — a fixture `GET /runs/:id/lineage` body parses to a typed `LineageGraphProjection`. Why: §12 validate-every-boundary. *(Positive guard.)*
2. **`test_invalid_payload_surfaces_typed_error`** — a malformed projection body → a typed error (not a raw throw / corrupt state). Why: §12/rule #9 untrusted server payload.
3. **`test_client_exposes_only_contract_endpoints`** — the client surface offers only the §11 endpoints + the 2 commands; no arbitrary URL/method. Why: §11 endpoint allowlist.
4. **`test_no_apps_api_import`** — structural: `apps/web/src/data` imports nothing from `apps/api`. Why: rule #9 / forbidden #6.

**`apps/web/test/unit/data/sseStream.test.ts`** (`spec(§11)`):
5. **`test_orders_and_dedupes_by_sequence_alone`** — events delivered out-of-order / duplicated are applied in `sequence` order; `sequence ≤ last applied` dropped; `occurredAt` never reorders. Why: §11 sequence sole ordering key / rule #2.
6. **`test_carries_last_event_id_watermark`** — after applying through `sequence` N, `lastEventId == N`; a reconnect resumes from N. Why: §11 resume-from-lastEventId.
7. **`test_sse_non_authoritative_resync_equivalent`** — dropping the stream and resyncing via the REST events path reaches the same view; SSE never becomes the source of truth. Why: §11/rule #2 SSE delivery-only.
8. **`test_validation_failure_typed_error_run_inspectable`** — an invalid SSE payload → a typed error; view state uncorrupted. Why: §12 validate-at-boundary.

**`apps/web/test/unit/app-shell.test.tsx`**:
9. **`test_app_shell_renders`** — the React 19 app mounts and renders the shell. Why: bootstrap smoke (toolchain end-to-end).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none** (the dashboard consumes frozen models **read-only**; it defines no Appendix-A model).
- **§2.5-seam touched?** Consumes `LineageGraphProjection` + the envelope/config/candidate/model-route contracts (frozen) — a **read-only consumer, no seam change**. The only shared-file touch is the `packages/contracts/src/index.ts` export extension **iff needed** — flag at Step 9 (two-impl worktree; minimize churn).
- **Orchestrator doc rows to write hot (Step 9):** likely the **first rows** in the `apps/web/CLAUDE.md` cross-doc table (the contracts the dashboard consumes via the typed client) + the **first `apps/web/LESSONS.md` entry** (the frontend data-seam conventions — Zod-validate-at-boundary, sequence-only ordering/dedupe, inject-the-transport for testability). I author hot.

## Things to flag at Step 2.5
1. **Bootstrap + P7.1 in one slice, or bootstrap-only first?** My default vote: **bundle** — the data-client tests prove the toolchain end-to-end, and a bootstrap-only slice has no TDD payload (brief-template anti-pattern). Kernel P1.1 precedent. Flag if you'd rather land the bootstrap as its own commit first.
2. **DOM runtime for the render smoke.** My default vote: **happy-dom** (lighter than jsdom) for the single render smoke; the data-client tests are DOM-free (pure logic + injected transport). Confirm.
3. **Transport injection.** My default vote: **inject the transport** — `runClient`/`sseStream` take a `fetch`-like + an `EventSource`-like factory, defaulting to the real browser globals; tests inject fakes (the frontend twin of the backend's fake-the-IO pattern, lesson L24). Keeps the client network-free + deterministic in tests. Confirm.
4. **Fixture source.** My default vote: **reuse `@doppl/contracts` `CANONICAL_FIXTURES`** (P0.14) where they exist (single source of truth, lesson L5 spirit); author web-local fixtures only for shapes not covered (e.g. a multi-node/edge `LineageGraphProjection`). Confirm.
5. **`packages/contracts/src/index.ts` extension.** My default vote: **verify the needed schemas are already exported; edit index.ts ONLY if one is missing** (it's a shared file; the api impl touches `packages/contracts` too — minimize concurrent churn; if you must, flag at Step 9 and stage just that line). Confirm none missing.

## Dependencies + sequencing
- **Depends on:** P0.1/P0.11/P0.13/P0.3/P0.5 (frozen contracts). **Independent of the live backend** (fixtures + injected transport). Independent of the in-flight P6.x slices (different area).
- **Blocks:** P7.2 (run store / reducer — consumes this client), and every later panel (P7.3–P7.14 read through `lib/`/`data/`). Establishes the `apps/web` package the whole P7 phase builds in.

## Estimated commit count
**1.** The `apps/web` bootstrap + the P7.1 read-only data seam as one coherent foundation (on the larger side due to bootstrap overhead, but one logical unit — "stand up the web app + its typed read-only data layer"). **Not a dedicated safety-invariant slice** (read-only client; the rule-#2/#9 postures — validate-every-payload, SSE non-authoritative, no-backend-import, no-secret-to-client — are structural, pinned by RED #2/#4/#5/#7). **Step-8 reviewers:** `security-reviewer` **recommended** (this is the frontend's load-bearing trust boundary — focus: every server payload Zod-validated before view state; no provider key reachable in the client; no `apps/api` import; SSE non-authoritative). `code-quality-reviewer` = phase-boundary (not per-slice).

## Lessons-logged candidates anticipated
- **Convention candidate (first `apps/web` lesson)** — "the dashboard data seam **Zod-validates every server payload before view state** (a validation failure is a typed error, never corrupt state); SSE is ordered/de-duped by **`sequence` alone** (never `occurredAt`) and is non-authoritative (resync from `lastEventId`); the client **injects its transport** (fetch/EventSource doubles) so it's network-free + deterministic in tests; it imports no `apps/api` internals + no secret."
- **Architecture-doc note candidate** — none anticipated (P7 consumes; it defines no model).
- **Future TODO — operational** — the real backend HTTP/SSE wiring + the Playwright e2e smoke (P7.15) land later; named, deferred.

## How to invoke
> This is the **first** slice in the `demo-web-implementer` session → run `/session-start` (cwd `apps/web/`) before `/tdd`. Confirm your cwd is `apps/web/` so the frontend conventions load.

1. **Read this brief end-to-end** — note the **two-impl staging rule** (stage only `apps/web/...`, never `-A`), the 5 Step-2.5 questions (esp. Q1 bundle + Q3 inject-transport), and that it's **fixture-driven** (no live backend).
2. **Run `/tdd web_data_client_seam`.**
3. **Step 0 (Restate)** — confirm the restatement matches the Feature line.
4. **Step 2.5** — answer the 5 design questions, send the Step-2.5 write-up + per-acceptance-bullet coverage map.
5. **Step 8** — `security-reviewer` recommended (client trust-boundary focus).
6. **Step 9** — surface the first `apps/web` LESSONS candidate + whether `packages/contracts/src/index.ts` needed an export (shared-file flag).
