# LESSONS.md — Doppl (the React dashboard)

> Full prose for every lesson logged during work in `apps/web/`. The compact index lives in `apps/web/CLAUDE.md` "Lessons logged" table.
>
> **Lesson numbers are stable IDs.** New lessons get the next sequential number. Numbers may be referenced from code comments, commit messages, and cross-references between lessons. **Don't reorder; don't reuse a deleted number's slot.**
>
> **Lessons start at §1.** Each code area has its own lesson sequence — lessons don't carry across code areas.

---

## Lesson format

```markdown
## <a id="N"></a>N. <Short topic> — <one-line rule>

**Date:** YYYY-MM-DD.
**Source slice:** <slice-id or commit hash>.

<2-5 paragraphs explaining: what was discovered, why it matters, how to
apply the rule, what edge cases are still open. Cite file:line references
where applicable.>

**Rule:** <one-sentence summary, same as the heading subtitle>.
```

---

## <a id="1"></a>1. The dashboard data seam validates every server payload before view state, orders SSE by sequence ALONE, and injects its transport

**Date:** 2026-06-21.
**Source slice:** P7.1 (`demo-003`; commit hash recorded at round close); `apps/web/src/data/{contracts,errors,runClient,sseStream}.ts`.

The dashboard is **read-only over projections** (safety rules #2/#9) and the data seam is where untrusted server bytes become typed view state — so the discipline lives here:

- **Validate every payload before view state.** Every REST read and every SSE event is parsed through the Zod schema (re-exported from `@doppl/contracts` via a single `contracts.ts` seam — never redefine a shape) BEFORE it reaches view state; a validation failure is a typed `PayloadValidationError`, never a raw throw or corrupt state, and the run stays inspectable via the other projections.
- **Gate the transport before the parser.** A non-2xx response is a typed `TransportError` checked via `res.ok` BEFORE parsing — otherwise a `404` body like `[]` false-accepts as valid data (the [medium] caught + fixed in-slice). Transport failure and schema failure are distinct typed errors.
- **SSE is ordered by `sequence` ALONE + non-authoritative.** Apply an event iff `sequence > lastApplied` (a monotonic watermark); anything `≤` the watermark — a duplicate OR a late lower sequence — is dropped; `occurredAt` is never consulted. `lastEventId == lastApplied` so a reconnect resumes from the watermark; dropping the stream loses nothing (a REST resync reaches the same view). Gap-triggered auto-resync is the run-store's job (P7.2), not the stream's.
- **Inject the transport.** `createRunClient({fetch})` / `createSseStream({eventSourceFactory})` default to the browser globals in prod and take fakes in tests — the client is network-free + deterministic, driven by fixtures + `@doppl/contracts` `CANONICAL_FIXTURES`.
- **No backend coupling, no secret, opaque ids encoded.** The seam imports no `apps/api` internals (rule #9), fetches/renders no provider key (rule #4), and percent-encodes opaque id path segments (never raw-concatenates — ids are untrusted bytes).

**Rule:** In the dashboard data seam, Zod-validate every server payload before view state (typed `PayloadValidationError`; gate non-2xx to a typed `TransportError` before parsing); order/dedupe SSE by `sequence` alone (monotonic watermark, `occurredAt` never consulted) and treat it as non-authoritative (resync from `lastEventId`); inject the transport (fetch/EventSource doubles) for network-free deterministic tests; import no `apps/api` internals, ship no secret, percent-encode opaque ids.

## <a id="2"></a>2. The client run-store folds validated events keyed by sequence (idempotent); resync reaches a fresh-fold; mode is carried not folded; the store is a pub-sub AND the SSE sink (IoC)

**Date:** 2026-06-21.
**Source slice:** P7.2 (`demo-006`; commit hash recorded at round close); `apps/web/src/state/{reducer,resync,runStore}.ts`.

The client run-store is the state layer over the §1 data seam, and its discipline:

- **Fold validated events keyed by `sequence`, idempotently.** The reducer applies an event iff `sequence > lastApplied` (a monotonic watermark) — so re-applying a seen sequence, or a seed-then-deltas overlap, never double-counts. The fold is the source of truth: initial load folds `GET /runs/:id/events`; "a fresh full load" = folding all events; **resync** fetches events after `lastEventId` and reaches **the same state a fresh fold would** (SSE non-authoritative — drop-and-resync is equivalent to an uninterrupted stream). Polling fallback applies new events without losing applied state.
- **Retain failure events; don't fold the mode.** The 7 failure event types are **retained + surfaced** (partial evidence stays visible), never dropped. `mode` (live|replay) is **carried on the store, not folded into the reducer** — live and replay events fold **identically** (the reducer takes no mode param), so the same log produces the same state regardless of source.
- **The store is a pub-sub AND the SSE sink (inversion of control).** `createRunStore({runId, runClient})` exposes `getState`/`getMode`/`subscribe`/`applyEvent`/`resync`/`poll`. It does **NOT** construct the SSE stream — it *provides the `onEvent` sink* (`createSseStream({onEvent: store.applyEvent, onError: () => store.poll()})`), and the connector is wired at integration/P7.14. This decouples the store from stream construction → testable in isolation with injected doubles.
- **Guard the resync cursor.** `assertValidCursor` rejects a non-numeric/negative `sinceSequence` BEFORE any fetch (defense-in-depth on the one new input).
- **Defer ambiguous derivations to their consumer.** The §12 in-flight node sub-state was deferred to P7.7 (where it's rendered + tested) because it has no P7.2 consumer and the start↔completion marker pairing is genuinely ambiguous (`judge.review_started` has no paired completion) — build it where it's consumed and the pairing can resolve, not speculatively.

**Rule:** The client run-store folds validated events keyed by `sequence` (idempotent monotonic watermark — re-apply/seed-overlap safe); resync after `lastEventId` reaches a fresh-fold state (SSE non-authoritative); retain failure events; carry `mode` on the store, never fold it (identical live/replay fold); make the store a pub-sub AND the SSE `onEvent` sink (IoC — wire the stream at integration); guard the resync cursor; and defer a consumer-less / pairing-ambiguous derivation to the slice that renders it.

## <a id="3"></a>3. Build the UI FROM the design-system prototype: COPY tokens + PORT components TS-strict; the status-map is exhaustive over the FROZEN enums (contract is authority, prototype is the design ref)

**Date:** 2026-06-21.
**Source slice:** P7.3 (`demo-008`; commit hash recorded at round close); `apps/web/src/styles/tokens/`, `apps/web/src/components/core/{StatusBadge.tsx, status-map.ts}`.

The dashboard UI is built FROM the committed `docs/doppl-design-system/` prototype, and the consumption discipline (from its `SKILL.md`):

- **COPY tokens, PORT components — never import the `.jsx`.** Copy `tokens/*.css` (+ the woff2 fonts) into `apps/web/src/styles/tokens/`, barrel them, import once at the app root (live app-wide, incl. the `.hc` high-contrast block + projector-legible sizes). PORT each `.jsx` component to **TS-strict** (implement the prototype's prop interface verbatim) — do NOT import the prototype's `.jsx` (it's a reference; its adherence linter forbids internal-path imports).
- **Adherence: `var()` tokens only, no raw hex/px** (pinned by a structural test over the component source). The production port may be **MORE adherent than the prototype reference** — the prototype's own `StatusBadge.jsx` used raw-px strings (`padding:"3px 8px"`), and the port fixes them to `--space-*` tokens (snapping off-grid 3px → the 4px grid; 1px delta, imperceptible; projector floor preserved). Fix the reference's imperfections in the port; record them as prototype-fidelity notes.
- **The status-map is EXHAUSTIVE over the FROZEN domain enums** — the **contract is the authority** for which statuses exist, the prototype is the **design reference** for how they look. A test iterates `Object.values(<enum>.enum)` for all six domains so a new enum value fails loudly. **Reconcile drift frozen-wins:** omit a prototype-only state not in the frozen enum (agenome `'mutated'` — mutation is a reproduction mode, not an agenome status); ADD a frozen-only state the prototype missed (candidate `'culled'`); ADD a whole domain the prototype lacked (`generation` 8-state, glyphs derived from the prototype's visual vocabulary); unknown/unmapped → a **distinct neutral indicator** (never throw/blank).
- **Status is shape + icon + label + color, never color alone** (colorblind-safe); the glyph is `aria-hidden`, the status is carried by the text label / `title` so it's programmatically determinable.

**Rule:** Build the dashboard UI FROM the design-system prototype — COPY its CSS tokens (consume via `var()`, no raw hex/px; the port may exceed the reference's own adherence) + PORT its components to TS-strict (never import the `.jsx`); make the status-map exhaustive over the FROZEN domain enums (contract = authority, prototype = design ref), reconciling drift frozen-wins (omit prototype-only, add frozen-only/missing-domain, unknown→neutral); encode status as shape+icon+label+color (never color alone), glyph `aria-hidden`, status in label/`title`.
