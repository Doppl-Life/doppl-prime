# Orchestrator routing ledger — kernel track (round in progress)

**Role:** kernel-runtime-orchestrator · **Date:** 2026-06-21 · **Branch:** track/kernel
**Purpose:** DURABLE record (survives an orchestrator cycle) of (a) cody-bound shared-root-doc edits that can't be written in this worktree, (b) track-local hot-writes already applied here, (c) live carry-forward. The lead reconciles git-derivable ticks at merge but NOT new doc-content items — those live here, not in session memory.

> **Why shared-root edits go to cody:** the kernel-worktree `IMPLEMENTATION_PLAN.md` / `ARCHITECTURE.md` are STALE fork copies; the authoritative copies live in the integration checkout (cody). The lead batches these at the next kernel→cody merge.

---

## A. Pending cody-bound shared-root-doc edits (hand to lead/cody at next merge)

### A.1 — `IMPLEMENTATION_PLAN.md` completed-work ticks (full kernel-track set pending cody)
Per lead merge plan (P2.2–P2.7 + P1.5–P1.8 + P1 phase-checkbox). cody no-ops any already-ticked.
- **P2.2** `[ ]→[x]` — role-keyed model registry; commit `8df860a` (prior round).
- **P2.5** `[ ]→[x]` — OpenRouter generation adapter; commit `5fd1c57` (prior round).
- **P2.6** `[ ]→[x]` — direct-OpenAI embedding adapter; commit `10a58d3` (prior round).
- **P2.7** `[ ]→[x]` — retrieval/web-search adapter; commit `67520ae` (this round).
- **P1.5** `[ ]→[x]` — **satisfied-by-P0** (no commit): EnergyEvent frozen P0.9 (`packages/contracts/src/domain/energy-event.ts`) + `energy.spent`→EnergyEvent narrowing P0.10 (`events/payload-map.ts:35`). Stale `events/energy-event.ts` path never existed. Lead-confirmed 2026-06-21.
- **P1.6** `[ ]→[x]` — **satisfied-by-P0** (no commit): NoveltyScore frozen P0.8 (`packages/contracts/src/scoring/novelty-score.ts`) + `novelty.scored`→NoveltyScore narrowing P0.10 (`events/payload-map.ts:39`) + embeddings-table-as-index shipped P1.4. Lead-confirmed 2026-06-21.
- **P1.7** `[ ]→[x]` — EvidenceRef resolver; commit `d3a61ed` (this round).
- **P1.8** `[ ]→[x]` — replay reader + canonical serialization; commit `dca9bc4` (this round). + fast-follow `86553c3` (kernel-014, the 2 phase-exit [medium]s).
- **Phase 1 checkbox** `[ ]→[x]` — **on the `/phase-exit P1` CLEAR verdict** (see §E). All P1 tasks done (P1.1–P1.4 shipped; P1.5/P1.6 satisfied-by-P0; P1.7/P1.8 shipped + hardened).

### A.2 — `ARCHITECTURE.md` §6 note (atomic with the round)
- Retrieval adapter (P2.7) **never-reject / always-curated-fallback** semantics: a terminal live-search failure falls back to the operator-curated corpus (tagged `fallbackSourced`), never throws `ProviderCallError`, never rejects (diverges from the P2.5/P2.6 throw→reject adapter leg; lesson §29). Empty curated match = valid empty result, not a failure.
- **Pluggable live-search seam** — no vendor pinned (user/lead directive); concrete provider deferred to the §6 retrieval spike. The retrieval credential loads **lazily in the live-client factory**, NOT in `assertProviderCredentials` (curated fallback needs no creds).

### A.2b — `ARCHITECTURE.md` §9 note (PENDING P1.7 land + Step-9 confirm)
- EvidenceRef resolver (P1.7) fail-closed taxonomy: `eventId` → resolve within the Postgres tier (`not_found` if absent); else a ref carrying ONLY `uri` **OR `langfuseObservationId`** → `external_only` (NEVER fetched — Langfuse is the §6/§13 non-authoritative side channel, replay never calls it); else (incl. `label`-only) → `no_pointer`. **Decision refines the kernel-012 brief** (which named only `uri`) — the langfuse-only leg was a Step-2.5 extension (folds the non-authoritative side-channel pointer into `external_only`, rule #7/§14).

### A.2c — `ARCHITECTURE.md` §9 note — replay reader (PENDING P1.8 land + Step-9 confirm)
- Replay reader (P1.8): **validate-not-sort** — asserts strictly-increasing + contiguous-from-0 `sequence` and throws `ReplayIntegrityError{ reason: 'gap' | 'out_of_order' | 'schema_too_new' }` (out_of_order checked before gap: `0,2,1`→out_of_order, `0,1,3`→gap); NEVER silently re-sorts/skips a corrupted authoritative log. Accepts `schemaVersion ≤ CURRENT_SCHEMA_VERSION` (older replays without upcasters), rejects `> current`.
- **Yield-shape decision:** `replayEvents` returns validated `RunEventRow[]` and does NOT re-parse to `RunEventEnvelope` — the P1.3 append path is the envelope-validation boundary (rule #2 append-only + P1.4 least-privilege make a stored row trustworthy by construction); replay's read-time invariants are ordering + schemaVersion only. Post-insert DB-tamper is P1.4's threat model, not replay's (so no 4th `malformed` reason). The fold consumes `RunEventRow` directly (consistent with `readByRun` + the P1.7 resolver).
- State-equivalence via `canonicalSerialize` (recursive key-sort, array order preserved). Rule #7 enforced structurally — the reader imports no provider/model/web seam (lesson 30).

### A.2d — `ARCHITECTURE.md` §4 note (STALE-DOC, from /phase-exit P1 arch-drift)
- §4 flow diagram says "ordered by run_id, sequence"; `readByRun` (`append.ts`) orders by `sequence` alone within a run-scoped `WHERE run_id = $1` — functionally equivalent (single-run query), diagram notation is loose. Tighten the diagram label or leave as-is (harmless). Architecture-doc note only; no code change.

### A.3 — `IMPLEMENTATION_PLAN.md` future-TODOs (add as phase tasks, anchored)
- **P3.1 boot:** wire `retrieval` into the role-dispatching providerCall — `createRetrievalProviderCall({ registry, client: undefined, corpus: DEFAULT_PRIOR_ART_CORPUS })`; part of the composite providerCall flagged in P2.6. (implements §6; origin: P2.7)
- **§6 retrieval spike (operational):** when a concrete live-search provider is wired — add its env var to the live-client factory's fail-fast check; decide whether it joins `assertProviderCredentials`' required set or stays optional (curated-fallback-always-available); set a real per-role timeout + cost/rate-limit envelope (RISK-004/005). (ops — §6)
- **P4/P5 consumers:** call `retrievalEvidenceRef(item, persistedEventId, kind)` at persist time + `searchCuratedCorpus(..., { kind })` with the consumer's kind (P4 prior_art / P5 signal). (implements §6/§7; origin: P2.7)
- **P6/PD + P1.8 consumers (EvidenceRef resolver):** dereference `evidenceRefs[]` via `resolveEvidenceRef` / `createEvidenceResolver` — create a FRESH resolver per projection/replay pass (the wrapper cache is read-once-per-run). P1.8 replay relies on the no-external-fetch property. (implements §9; origin: P1.7)
- **P6/PD consumers (replay reader):** P6 projection builders inject their real current-state/lineage folds into `replayRun(rows, fold, init)`; PD = the recorded-event replay-fallback (seed-to-summary) demo. **Fold states MUST be JSON-safe** (Dates OK — `toJSON`-normalized by `canonicalSerialize`; BigInt/circular throw loud). (implements §9; origin: P1.8)
- **P6 — event-store barrel write-gate ([low], from /phase-exit P1 code-quality):** `apps/api/src/event-store/index.ts` `export * from './schema'` re-exports all 12 table objects ungated; when P6 projection-builders land, add a write-gate so a builder can't `db.insert(<authoritative table>)` outside the append path (rule #2). (implements §9; origin: /phase-exit P1)

---

## B. Track-local hot-writes ALREADY applied in this worktree (commit at /orchestrate-end)
- **LESSONS §29** — "demo-safety fallback adapter" (fallback-not-reject; diverges from §28) → `apps/api/LESSONS.md` + index row in `apps/api/CLAUDE.md`. Pin: `apps/api/test/unit/model-gateway/adapters/retrieval.adapter.test.ts`.
- **LESSONS §30** — "replay-safety by construction" (rule #7 via purity/no-seam; informs P1.8) → `apps/api/LESSONS.md` + index row in `apps/api/CLAUDE.md`. Pin: `apps/api/test/unit/event-store/evidence-resolver.test.ts`.
- **LESSONS §31** — "validate-not-sort + toJSON-aware canonical equivalence" (the P1.8 [medium] Date-collapse) → `apps/api/LESSONS.md` + index row in `apps/api/CLAUDE.md`. Pin: `apps/api/test/unit/event-store/canonical-serialization.test.ts`.
- **LESSONS §26 + §31 tightenings (kernel-014)** — §26 forward-guard HARDENED (schema_invalid now path+code-only via `summarizeValidationIssues`; the real Zod-4 echo vector is `unrecognized_keys`; neutralized today by `z.record(z.string(),z.unknown())` payload) + §31 extended (toJSON ONCE per slot via `canonicalizeStructure` + DROP function/undefined so a surviving toJSON can't be re-invoked). No new lesson number. Pin: `apps/api/test/unit/event-store/{canonical-serialization,append}.test.ts`.
- **Briefs authored:** `docs/briefs/kernel-011-P2.7-retrieval-adapter.md` (spec-lint `@9f2037ee`) · `docs/briefs/kernel-012-P1.7-evidence-ref-resolver.md` (spec-lint `@da73b3c0`) · `docs/briefs/kernel-013-P1.8-replay-reader.md` (spec-lint `@25711b52`) · `docs/briefs/kernel-014-P1.8-followup-canonicalize-and-append-error-hardening.md` (spec-lint `@f9564577`).
- **This routing ledger:** `docs/sessions/kernel-003-2026-06-21-orchestrator-routing-ledger.md`.

---

## C. Live carry-forward (re-derive at consuming phase)
- **P3-gateway (lead-held, re-derive from LESSONS §27/§28 + gateway code at P3):** role-dispatching `providerCall` composing per-role adapters (openrouter/openai-embedding/retrieval) + `assertProviderCredentials` first; **single-source `deepMerge`** (mirror retired once a 3rd in-track consumer appears — P3.1 boot-config is the candidate); **per-role-timeout = adapter config** (not a `ModelRoute` field).
- **Held-out judge LOAD path (cross-track → verifier P4 / selection P5):** validate `FinalJudgeRubric` from immutable config (never an agent-writable path) + assert full 5-axis set + `immutableToAgents:true` before scoring (rule #6). [predecessor carry-forward]

---

## E. /phase-exit P1 — GATE RESULT (2026-06-21) → CLEAR (pending session-doc row)

Multi-track note: executed against git + code reality (kernel-worktree tracker is the stale fork). Verdict + Log entry + P1 phase-checkbox → **cody** (this section is the durable hand-off).

| # | Row | Result | Evidence |
|---|---|---|---|
| 1 | All phase task checkboxes ticked | ✅ | P1.1 `1c301b1` · P1.2 `1f79273` · P1.3 `8bcce9c` · P1.4 `ec3a549` · P1.5/P1.6 satisfied-by-P0 · P1.7 `d3a61ed` · P1.8 `dca9bc4` |
| 2 | Acceptance criterion met | ✅ | P1 acceptance (append-only+sequence+redaction+§4 contracts+migrations+embeddings-authoritative+evidence-in-tier+replay-state-equivalence) all shipped; no runtime smoke (boot=P3, MVP-acceptable) |
| 3 | `/preflight` clean | ✅ | lint+typecheck Done (both projects); unit contracts 163/163 + apps/api 101/101 |
| 4 | Cross-doc invariants verified | ✅ | P1 added NO Appendix-A field change (all consumed frozen P0.1/P0.5/P0.8/P0.9) |
| 5 | Reachability audit clean | ✅ CLEAR | `docs/audits/P1-reachability.md` — 35 exports, 0 silent gaps; all explicit-deferrals named to P3/P6/PD |
| 6 | Arch-drift audit clean (§4/§9/§14) | ✅ CLEAR | 0 drift; 1 STALE-DOC note (see below). (auditor returned inline; no file written) |
| 7 | Spec coverage | ✅ | `spec-lint tests P1` exit 0 (parser skipped anchor-subset on stale-fork header format; per-slice spec(§)-tagged pins present — contracts 163 incl. all snapshots) |
| 8 | Whole-system security review (qualifying) | ✅ CLEAR | `docs/audits/P1-security.md` — rules #2/#4/#7 hold across integrated surface; 4 per-slice fixes HELD; no residual |
| 9 | Dependency audit | ✅ | `pnpm audit --prod` → No known vulnerabilities |
| 10 | Perf budgets | ✅ n/a | deliberate deferral (REQ-NF-003) |
| 11 | Session doc(s) exist | ⏳ pending | P1.1–1.4 in kernel-002; P1.7/P1.8 → impl `/session-end` kernel-004 IN FLIGHT |
| 12 | Commits pushed | ✅ verify-only | not-ahead surprise; slice commits push at `/orchestrate-end` |

**VERDICT: CLEAR** on all gate rows (row 11 completes when kernel-004 session doc lands). No row FAILED → not BLOCKED.

**Code-quality reviewer (phase-boundary, NOT a gate row — advisory) — CLEAR-with-notes** (`docs/audits/P1-code-quality.md`). Findings to disposition (escalated to lead):
- **[medium] `canonical-serialization.ts:24`** — `canonicalize` re-enters itself on the `toJSON()` result, so a toJSON returning a toJSON-bearing object would call toJSON twice (JSON.stringify calls once per slot). VERIFIED real by me. Bites only when a P6 fold-state value has a nested-toJSON object; Date (returns string) unaffected. Fix: handle the toJSON result's array/object/primitive inline without re-checking toJSON. → **fast-follow recommendation.**
- **[medium] `append.ts:64`** — `schema_invalid` error interpolates `parsed.error.message` which can include Zod's `.received` value (e.g. a secret-shaped `actor`). LESSON 26 forward-guard. Latent (AppendError not currently persisted/emitted). Fix: emit issue `.path`/`.code` only. → **fast-follow recommendation.**
- **[low] `index.ts:8`** — `export * from './schema'` re-exports all 12 table objects ungated (a future projection-builder could `db.insert` without a gate). → **P6 carry-forward** (add write-gate when builders land).

**Arch-drift STALE-DOC note (→ cody, ARCHITECTURE §4):** the §4 flow diagram says "ordered by run_id, sequence"; `readByRun` orders by `sequence` alone within a run-scoped `WHERE` — functionally equivalent, diagram notation loose. Architecture-doc note only.

## F. Carry-forward triage recommendation (for cody — `IMPLEMENTATION_PLAN.md` "Carry-forward")
The kernel-worktree fork's Carry-forward (5 predecessor items) — recommended triage at merge (I can't edit the stale fork):
1. **IDs opaque/unbounded strings** → **KEEP** (cross-track). Kernel portion CONSUMED (P1.3 append ids parameterized; P1.7 resolver exact-equality match) — note that; P6/P7/PD projection/demo portion still open.
2. **Payload size/depth ceiling — P1 portion** → **DELETE** (consumed). P1.3 append path calls `validateEventPayload` before insert + rejects via `AppendError` (caller emits the violation) — `8bcce9c`. Residual Fastify `bodyLimit` request-byte gate → SPREAD to P6 (routes), `last-consumer-slice: P6.x`.
3. **`validateRunConfig` canonical boot-config entry** → **KEEP** (cross-track → kernel P3.1; not yet consumed).
4. **§14 env-VALUE redaction layer** → **KEEP**. Kernel portion CONSUMED (P1.2 — env-value scrub at the write boundary, reachability-pinned); demo portion (P6.5 Langfuse) open → DELETE when demo consumes.
5. **Opaque gateway passthroughs scrubbed at persistence boundary** → **KEEP** (P3 gateway wiring finalizes the reachability pin; the scrub already covers all payloads via P1.2/P1.3).
6. **Held-out judge LOAD path validates rubric** → **KEEP** (cross-track → verifier P4/P5; not consumed).
Net: 1 DELETE, 1 SPREAD-residual, 4 KEEP (3 with "kernel portion consumed" notes). Carry-forward stays ≤7.

## D. Round status
- **Shipped this round:** P2.7 (`67520ae`) · P1.7 (`d3a61ed`) · P1.8 (`dca9bc4`) · kernel-014 P1.8-followup (committing — hash on done-wake). Impl session doc kernel-004 (`561c9b5`, covers P2.7/P1.7/P1.8).
- **Phase 1 = COMPLETE** (P1.1–P1.4 shipped; P1.5/P1.6 satisfied-by-P0; P1.7/P1.8 shipped). `/phase-exit P1` → **CLEAR** (see §E). P1 phase-checkbox tick → cody.
- **Next:** `/orchestrate-end` seal (after kernel-014 commits) → push track/kernel → hand ledger to lead for kernel→cody merge → then **P3** (bundling resumes; safety-invariant slices SOLO). P3 does NOT wait on the cody merge.
- **Suite (post-kernel-014):** contracts 163/163 + apps/api 108 unit / 20 integration.
