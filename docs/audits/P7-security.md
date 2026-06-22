# P7 Phase-Exit Security Review — `apps/web/` dashboard

- **Track:** `demo` · **Branch:** `track/demo` · **Worktree:** `/Users/dreddy/Documents/GauntletAI/Capstone-demo`
- **Reviewer:** security-reviewer (phase-boundary dispatch from `/phase-exit`)
- **Date:** 2026-06-22
- **Dispatch policy:** `phase-boundary` — this IS the whole-system security pass for Phase 7.
- **Verdict: CLEAR** (no critical / high / medium findings; 1 low advisory)

## Scope + over-approximation note

`apps/web/` did not exist at the demo-track fork (bootstrap commit `38749ac`, P7.1). Every file
under `apps/web/src/**` is therefore inside the accumulated P7 branch diff, so the review surface ≈
the entire `apps/web/src/**` tree. This is the documented phase-boundary over-approximation (accepted):
later P7 slices' diffs are subsumed. Most recent delta reviewed: P7.3 sv5 status-map reconcile
(`87e90d3` — `generation.degraded` + `candidate.repairing`). 48 source files (`.ts`/`.tsx`/`.css`).

Trust boundaries crossed by the phase: the REST/SSE seam to `apps/api` (untrusted server payloads in),
the two idempotent contract commands (the only writes out), and the operator run-config input (the only
user-supplied input). All three were reviewed against the apps/web safety invariants below.

## Invariant pass (invariant-touching: yes — the dashboard is the rule-#2/#4 acceptance surface)

| # | Invariant | Verdict | Evidence |
|---|---|---|---|
| 2 | **UI read-only over projections; only writes = the 2 idempotent contract commands; SSE non-authoritative** | **PASS** | `runClient.ts` exposes exactly 7 GET projections + `startRun`/`stopRun` (`POST /runs`, `POST /runs/:id/stop`) — no other method/URL is representable (closed surface, l.105-118). `runStore.ts` "never mutates authoritative state — it only folds validated events and resyncs/polls read-only" (l.11-13, `applyEvent`/`resync`/`poll` only). `sseStream.ts` is delivery-only: ordered/deduped by `sequence` ALONE, `occurredAt` never consulted (l.35-40), reconnect resumes from `lastEventId` watermark (l.65-69); dropping the stream loses no authoritative state (REST re-fold reaches identical view). `dashboardWiring.ts` wires `onError → store.poll()` REST fallback (l.40-42). `Dashboard.tsx` confirms "the only writes are the contract commands the launcher/stop already issue" (l.34-36); `RunConfigPanel`/`StopControl` are the sole write mounts (l.198-201). `runControl.ts` derives terminal state from folded store events, never guesses optimistically (l.71-88). |
| 4 | **No secret to client; EvidenceRef/trace render in-tier, no external href** | **PASS** | Grep for `secret\|api[_-]?key\|password\|bearer\|authorization\|providerKey\|openrouter\|openai`: only hits are the static trust-indicator label `"Secret redaction active — no secrets in payloads"` (`Dashboard.tsx` l.184, a `role="note"` literal, not a fetched value) + the `mvp-openrouter` model-profile *name* (`runConfigForm.ts` l.48, a non-secret identifier). No `import.meta.env`/`process.env` read anywhere (grep: none). No `localStorage`/`sessionStorage`/`document.cookie` (grep: none). `evidenceRef.tsx` renders `eventId`/`uri`/`langfuseObservationId` as TEXT + `data-*` attrs, explicitly NEVER an `<a href>` (l.30-48). `finalIdeaData.ts` `winnerTraces` carries `langfuseTraceId`/`observationId` as in-tier `TraceRef` text (l.61-70). Grep for `https?://`: none. Grep for `href\|window.open\|location`: only doc-comment mentions affirming "no external href." |
| — | **No backend-internals import (only `packages/contracts` shared)** | **PASS** | Grep `from ['"].*apps/api`: none. All contract types flow through the single `data/contracts.ts` re-export of `@doppl/contracts` (l.12-31); `health.ts` is a web-local schema for the unfrozen `/health` endpoint (documented MVP, not an `apps/api` import). |
| — | **Status never color-alone (a11y-as-safety, §12)** | **PASS** | `status-map.ts` encodes every status as `{glyph, label, colorToken}` — color is the explicit "4th redundant channel, never the sole encoding" (l.10-12, l.21-22); unknown→`NEUTRAL_SPEC` `?`/`unknown` (never throws/blanks, l.31-36, l.130-133). `StatusBadge.tsx` renders shape+icon+label+color, glyph `aria-hidden`, status reaches AT via text label + `title` (l.5-13, l.81-110). `nodeTypes.tsx` lineage nodes + `evidenceRef.tsx` use the same primitive. sv5 additions `generation.degraded` (◓, shape-distinct from △) + `candidate.repairing` (↻, shape-distinct from ◐) preserve shape-distinct encoding (l.51-53, l.96-99). |
| — | **Input validation: every server payload Zod-validated before view state; ids percent-encoded** | **PASS** | `errors.ts` `parseOrThrow` is the single validate-at-boundary helper → typed `PayloadValidationError`, never a raw throw / corrupt state (l.42-53). `runClient.getJson` gates on HTTP `res.ok` BEFORE parse → `TransportError` (so a schema-satisfying error body can't be false-accepted, l.82-89) then `parseOrThrow` (l.87-88). `sseStream` `parseOrThrow(RunEventEnvelope, …, JSON.parse(event.data))` with try/catch → bad event dropped, watermark unchanged (l.79-96). Every opaque id is `encodeURIComponent`-wrapped (`enc`), never raw-concatenated, on all 8 id-bearing paths (`runClient.ts` l.73, l.102-117; `dashboardWiring.ts` l.34). Run-config write input validated against frozen `RunConfig.safeParse` + a fail-closed cap-max guard (`runConfigForm.ts` l.106-130). |

All five invariant axes: **PASS**. No bypass surface, no unvalidated path, no authoritative-write path, no secret leak, no `apps/api` import.

## General security pass — 0 critical / 0 high / 0 medium / 1 low

- **Injection (SQL/cmd/path/XSS/SSRF):** No `dangerouslySetInnerHTML`, `.innerHTML`, `insertAdjacentHTML`, `eval`, or `new Function` anywhere (grep: none). All server-derived strings (candidate `title`/`summary`/`claims`/subtype payloads, evidence `uri`, status labels, lineage labels/metrics) render as React text children → auto-escaped. URL construction is closed (no arbitrary URL; ids percent-encoded; no `https?://` literal → no SSRF/open-redirect surface). **PASS.**
- **Candidate-text-as-data (rule #5 spirit, client side):** `CandidateInspector.tsx` displays candidate text as DATA, never interpolated into an instruction string (l.15) — confirmed: all candidate fields go to JSX text nodes, none to a template/prompt. `selectWinner`/`gatherProof` read the kernel's `status:'selected'` winner VERBATIM and never re-rank from scores/critiques (rule #6 anti-reward-hacking honored at the most tempting surface, `finalIdeaData.ts` l.18-27). **PASS.**
- **Unbounded loops / DoS:** No `while`, no recursion, no user-controlled unbounded iteration. Every loop is `for…of` / `.map` over already-Zod-validated, kernel-capped event/node arrays (caps are kernel-enforced, rule #1; the dashboard renders a bounded validated list). `state/runStore.ts` listener loop is over a local `Set`. **PASS.**
- **Input validation at the only user-input surface:** `runConfigForm.validateForm` is fail-closed — requires ≥1 subtype, clamps caps lowering-only to `CAP_CEILING`, and runs the frozen `RunConfig.safeParse`; per-field errors render inline (no corrupt submit). The browser cap-max is documented DEFENSE/UX only; "the kernel enforces the real caps regardless (rule #1)" (`runConfigForm.ts` l.4-10, l.33-34). **PASS.**
- **Information disclosure (errors/logs):** Typed errors (`PayloadValidationError`/`TransportError`) carry `endpoint` + `status`/Zod `issues` for diagnostics — no secret/PII channel; error UI strings are static ("Failed to load candidate — retry."). No `console.*` secret leak observed. **PASS.**
- **Reentrancy / race:** Effects guard with an `active` flag + cleanup (`CandidateInspector.tsx` l.117-135, `Dashboard.tsx` l.139-169); the module-stable `defaultEventSourceFactory` (l.104-106) prevents the effect-dep churn loop LESSONS §10 caught. No external-call-before-state-update fund-movement surface (frontend). **PASS.**
- **Transport seam integrity:** Direct `fetch`/`EventSource` exist ONLY as the injected-default inside `runClient.ts` (l.70) and the module-const `defaultEventSourceFactory` (`Dashboard.tsx` l.106) — both injectable, so tests are network-free + deterministic. No `WebSocket`, no second transport. **PASS.**

## Low advisory (non-blocking — note only, implementer's discretion)

- **[low]** `apps/web/src/data/health.ts:14-24 / runClient.ts:117` — `RunHealth` is a web-local non-strict (`z.object`, forward-tolerant) schema for the unfrozen `GET /runs/:id/health` endpoint, and `capsConsumed` is an open `z.record(z.string(), z.number())`. This is correctly documented as an MVP carry-forward (P0 frozen, demo can't amend contracts unilaterally) and is **not** a security defect — the values are rendered as plain text (`Dashboard.tsx` l.188-194) and the schema still validates structure. Advisory: at the demo→cody merge, reconcile against P6.8's real shape and decide on promotion to a frozen contract (already tracked as an integration carry-forward in `health.ts` l.9-13). Action: `defer` (merge-time carry-forward, already logged).

## Verdict

**CLEAR.** No critical, high, or medium finding. All five apps/web safety invariants PASS; the general
security pass is clean across injection, candidate-text-as-data, unbounded-loop/DoS, input validation,
information disclosure, reentrancy, and transport integrity. No Step-9 `Finding` (no secret leak, no
authoritative-write path, no `apps/api` import). Phase 7 security row: **PASS**.
