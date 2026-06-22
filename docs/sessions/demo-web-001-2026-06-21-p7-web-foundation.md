# Session demo-web-001 — P7 web foundation (P7.1–P7.4)

- **Date:** 2026-06-21
- **Track / area:** `demo` / `apps/web` (implementer: demo-web-implementer)
- **Phase:** Phase 7 — Frontend dashboard
- **Predecessor:** none for the web track (forked from the kernel freeze bundle — `kernel-001-2026-06-21-freeze-bundle.md`)
- **Successor:** `demo-web-002-2026-06-21-p7.5-run-config-panel.md`

> **Filename note:** the demo track has TWO implementers (web + observability), so the per-track `NNN`
> counter would collide. This doc is **area-qualified** (`demo-web-NNN`) so the web + observability
> session docs never clash on merge; the observability impl uses its own prefix.

## Why this session existed

Stand up the entire frontend foundation: `apps/web` was unscaffolded (only CLAUDE.md/LESSONS.md). The
goal was the read-only data layer + the client state model + the design-system foundation + the first
accessible primitives — all built FIXTURE-driven (no live backend; real wiring is integration-time) and,
from P7.3 on, FROM the committed `docs/doppl-design-system/` prototype.

## What was built (4 slices, 4 commits)

| Slice | Commit | Summary |
|---|---|---|
| P7.1 | `38749ac` | apps/web bootstrap + read-only REST/SSE data client |
| P7.2 | `2d43ac7` | client run-store: sequence-keyed fold + resync + polling fallback |
| P7.3 | `65a988c` | accessible status primitive + design-token foundation (FROM prototype) |
| P7.4 | `e75f809` | live/replay mode indicator — ModeBanner |

### Files created

**Bootstrap / toolchain (P7.1):**
- `apps/web/package.json` — `@doppl/web`; React 19.2 + Vite ^8 + @vitejs/plugin-react ^5.2 + vitest 4.1.9 + happy-dom (peer-clean set; verified against the registry).
- `apps/web/tsconfig.json`, `vite.config.ts` (`@doppl/contracts` source alias, node default test env), `eslint.config.mjs` (extends root + JSX), `index.html`.
- `apps/web/src/vite-env.d.ts` (P7.3) — `vite/client` ambient types so the CSS side-effect import typechecks.

**Data seam (P7.1):**
- `apps/web/src/data/contracts.ts` — the single typed seam re-exporting the needed `@doppl/contracts` schemas (never redefine).
- `apps/web/src/data/errors.ts` — `PayloadValidationError` + `TransportError` + `parseOrThrow` (validate-at-boundary).
- `apps/web/src/data/runClient.ts` — REST client; §11 endpoint allowlist (7 GET + 2 idempotent POST; getHealth deferred to P7.14); Zod-validate-on-read; non-2xx → TransportError before parse; opaque ids percent-encoded; injected `fetch`.
- `apps/web/src/data/sseStream.ts` — SSE consumer; ordered/deduped by `sequence` ALONE (monotonic watermark, occurredAt never consulted); `lastEventId` resume; non-authoritative; injected EventSource; event-level `foldEvents`.
- `apps/web/src/App.tsx`, `src/main.tsx` — minimal design-neutral shell + Vite entry.

**Client state (P7.2):**
- `apps/web/src/state/reducer.ts` — sequence-keyed idempotent view-state fold; per-entity latest-status by most-specific id; 7 failure types retained; `mode`-independent.
- `apps/web/src/state/resync.ts` — `resyncFromRest` (fetch-after-lastEventId → same state as a fresh fold), `pollOnce`, `assertValidCursor` (P7.1 [low] consumed).
- `apps/web/src/state/runStore.ts` — `createRunStore` pub-sub + IoC sseStream `onEvent` sink; carries live/replay mode without changing fold.

**Design foundation (P7.3):**
- `apps/web/src/styles/index.css` (barrel) + `src/styles/tokens/{colors,typography,fonts,spacing,base,elevation,motion}.css` (copied from prototype) + `src/styles/assets/fonts/*.woff2` (7).
- `apps/web/src/components/core/status-map.ts` — exhaustive over all 6 frozen domain enums; frozen-wins drift reconciliation; unknown→neutral; var() color tokens.
- `apps/web/src/components/core/StatusBadge.tsx` — TS-strict port, full props; shape+icon+label+color (never color alone); adherence-clean.

**Mode indicator (P7.4):**
- `apps/web/src/components/feedback/ModeBanner.tsx` — TS-strict port; `deriveMode(mode, runStatus)` TOTAL over the 8 RunStatus; live/replay/terminal; adherence-clean.

**Tests (43 unit total):** `test/unit/data/{runClient,sseStream}.test.ts`, `test/unit/app-shell.test.tsx`, `test/unit/state/{reducer,resync,runStore}.test.ts`, `test/unit/components/{status-map.test.ts,StatusBadge.test.tsx,ModeBanner.test.tsx}`, `test/fixtures/{lineage,events}.ts`.

### Files modified
- `src/main.tsx` — P7.3 added the token CSS import at the app root.

## Decisions made
- **Vite ^8 / @vitejs/plugin-react ^5.2 / vitest 4.1.9** — peer-clean (vitest 4.1.9 peers vite ^6‖^7‖^8; plugin-react 5.2 peers ^8) — avoids plugin-react 6's babel/rolldown peers.
- **SSE ordering = monotonic watermark** (apply iff `sequence > lastApplied`; ≤ dropped; occurredAt never consulted) — not a reorder buffer; gap auto-resync is P7.2's resync path.
- **Transport vs validation are distinct typed errors** — non-2xx gated on `res.ok` BEFORE parse (closes a [medium]: a 404 `[]` won't false-accept as an empty projection).
- **Store IoC** — `createRunStore` is the sseStream `onEvent` sink; the connector is wired at integration/P7.14 (decoupled from stream construction, testable in isolation).
- **Build UI FROM the prototype** — COPY tokens (consume via `var()`, no raw hex/px), PORT components TS-strict (don't import `.jsx`); the FROZEN enums are the authority; drift reconciled frozen-wins.
- **`deriveMode` is TOTAL over RunStatus** — exhaustive switch, no default → a new RunStatus value fails typecheck (configured→live, cancelled→stopped beyond the brief's 6).
- **Adherence fidelity-fix** — the prototype's StatusBadge/ModeBanner use raw-px strings (violating their own `_adherence`); the ports fix them (`thin` border, `--space-*` padding, `color-mix(var(--warning))` hatch; numeric glyph sizes kept — projector floor 13 preserved).

## Decisions explicitly NOT made (deferred)
- **In-flight / activity derivation** → P7.7 (start↔completion marker pairing is ambiguous — `judge.review_started` has no paired completion; rendered+tested where consumed).
- **Health endpoint + `RunHealthSignal`** → P7.14 (no frozen contract; API-owned, P6.8).
- **Real backend HTTP/SSE wiring** → integration (this session is fixture + injected-transport driven).
- **`_adherence.oxlintrc.json` wired into preflight** → P7.14 polish (apps/web lints via eslint).
- **`sinceSequence` numeric guard** → consumed in P7.2 (`assertValidCursor`); the P7.1 [low] is closed.

## TDD compliance
**Clean.** Every slice was strict RED → Step-2.5 review → GREEN → Step-10 commit; RED was confirmed
failing-for-the-right-reason before each GREEN. The only post-GREEN test edits were **fixture/assertion
corrections** (P7.1 `test_encodes_opaque_id` used the wrong response fixture; P7.4 `test_not_color_alone`
asserted happy-dom-unreliable serialized CSS) — both corrected the test to match already-correct behavior,
never implementation-before-test. The P7.1 [medium] (res.ok gate) fix was RED-first (2 new failing tests
→ TransportError). No safety-invariant slices this session (all read-only/presentational).

## Cross-doc invariant audit
**Clean — no model field changes.** All P7.1–P7.4 are read-only consumers of frozen `@doppl/contracts`
models; `packages/contracts/src/index.ts` was NOT edited (every consumed schema already exported).
"Cross-doc invariant change: NONE" was flagged at every Step 9 (multi-track memory check). The
`apps/web/CLAUDE.md` + `apps/web/LESSONS.md` working-tree changes are the orchestrator's hot-routing
(LESSONS §1–§3, consumed-contracts rows, module-layout reconciliation) — not implementer territory.

## Reachability
- **App shell** — reachable from the Vite entry (`index.html` → `src/main.tsx` → `App`); render smoke.
- **Design tokens** — WIRED at the app root (`main.tsx` imports `styles/index.css` → live app-wide).
- **Data client (runClient/sseStream)** — first consumer P7.2 (the store consumes it); real HTTP/SSE wiring at integration. *(tested + consumed by the store; real-backend wiring pending integration)*
- **Run store** — first consumers = P7.3+ panels (subscribe) + P7.14 shell (mount). *(tested-but-unwired → P7.14/panels)*
- **StatusBadge** — first consumers = P7.5+ panels / P7.7 lineage (P7.4 ModeBanner is a distinct feedback component, not a StatusBadge consumer). *(tested-but-unwired → P7.5+)*
- **ModeBanner / deriveMode** — first consumer = P7.14 shell (persistent global mount). *(tested-but-unwired → P7.14)*

## Open follow-ups (Step-9 categorized + wiring)
- **Future-TODO (belongs to a phase):**
  - Run store → wire to P7.3+ panels (subscribe) + P7.14 shell (mount) + integration (sseStream/runClient → real backend).
  - StatusBadge → consumed by P7.5+ panels + P7.7 lineage nodes.
  - ModeBanner → global persistent mount in the P7.14 shell.
  - In-flight/activity derivation → P7.7 (+ a P3 marker-pairing reconcile note).
  - Health endpoint + RunHealthSignal → P7.14.
  - `_adherence.oxlintrc.json` → wire into apps/web preflight (P7.14).
  - Playwright e2e happy-path smoke → P7.15 (also covers the ModeBanner hatch visual that happy-dom can't serialize).
- **P7.14 wiring note (orchestrator-recorded):** a LIVE ModeBanner must re-derive RunStatus from the `run.*` SSE stream — a one-time `getRun()` REST fetch won't transition the banner live; consider a small P7.2 store enhancement exposing a run-status derived from `run.*` events. `deriveMode` stays pure.
- **Prototype-fidelity notes (orchestrator-recorded):** status drift (agenome `mutated` omitted, candidate `culled` added, `generation` 8-state added); the prototype's components violate their own `_adherence` (raw-px) — the production ports fix it.
- **Testing note:** happy-dom can't serialize `color-mix()`/gradients/`thin solid var()`; not-color-alone is asserted via the label+icon channels; the visual hatch is covered by the P7.15 Playwright smoke.

## Shared-worktree hygiene (two-impl)
Every commit staged `apps/web/...` only (never `-A`). `pnpm-lock.yaml` was staged ONLY at P7.1 (the
`@doppl/web` deps + a benign happy-dom vitest-peer ripple); P7.2–P7.4 added no deps and left the
lockfile's later `M` (the observability impl's P6.6/P6.7 Fastify deps) untouched. No `apps/api/**` or
orchestrator-territory file was ever staged.
