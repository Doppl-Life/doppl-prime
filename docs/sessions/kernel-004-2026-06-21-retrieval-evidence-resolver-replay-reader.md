# kernel-004 — P2.7 retrieval adapter · P1.7 EvidenceRef resolver · P1.8 replay reader (Phase-1 close)

- **Date:** 2026-06-21
- **Track / phase:** kernel · Phase 2 (model gateway) tail + **Phase 1 (persistence) close**
- **Role:** kernel-runtime-implementer
- **Predecessor:** [kernel-002](kernel-002-2026-06-21-freeze-bundle-and-p2.2-registry.md) (last implementer session; freeze bundle + P2.2 registry)
- **Successor:** _(next kernel-runtime-implementer session — P3 runtime kernel)_
- **Related (orchestrator territory):** [kernel-003](kernel-003-2026-06-21-orchestrator-routing-ledger.md) (orchestrator routing ledger)
- **Commits this round:** `67520ae` (P2.7) · `d3a61ed` (P1.7) · `dca9bc4` (P1.8)

> Earlier this session (prior orchestrator round, sealed `a80be52`): **P2.5** OpenRouter generation adapter `5fd1c57` + **P2.6** OpenAI embedding adapter `10a58d3` — see those commits; this doc covers the round-3 slices the orchestrator scoped (P2.7/P1.7/P1.8) for the clean Phase-1 record.

## Why this session existed

Continue the post-freeze kernel arc. Two threads converged: finish the Phase-2 provider-adapter set (the retrieval/web-search adapter, the last of the three vendor seams), and close the rest of Phase 1 (the EvidenceRef resolver + the replay reader — the two read-side pieces the P6 projections and the PD replay-fallback demo depend on). P1.8 closes Phase 1.

## What was built

### Files created
- `apps/api/src/model-gateway/adapters/retrieval.adapter.ts` (P2.7) — pluggable live-search seam (`RetrievalSearchClient`, no vendor pinned) + curated-corpus fallback; `createRetrievalProviderCall` (never throws — falls back) + the pure `retrievalEvidenceRef` (eventId-anchored, kind∈{prior_art,signal}).
- `apps/api/src/model-gateway/adapters/curated-corpus.ts` (P2.7) — pure `searchCuratedCorpus` / `loadCuratedCorpus` (no IO/clock/random; replay-safe).
- `apps/api/src/config/prior-art-corpus.config.ts` (P2.7) — `DEFAULT_PRIOR_ART_CORPUS` (operator-curated, secret-free).
- `apps/api/src/event-store/evidence-resolver.ts` (P1.7) — pure `resolveEvidenceRef(ref, rows)` (Postgres-tier dereference, fail-closed `not_found`/`external_only`/`no_pointer`) + thin async `createEvidenceResolver` (readByRun-once, evict-on-rejection).
- `apps/api/src/event-store/replay-reader.ts` (P1.8) — `replayEvents` (validate-not-sort; `ReplayIntegrityError{gap|out_of_order|schema_too_new}`) + generic `replayRun` fold + thin `createReplayReader`.
- `apps/api/src/event-store/canonical-serialization.ts` (P1.8) — `canonicalSerialize` (recursive key-sort, array order preserved, `toJSON`-aware) for state-equivalence.
- Tests: `adapters/retrieval.adapter.test.ts` (9), `adapters/curated-corpus.test.ts` (4), `event-store/evidence-resolver.test.ts` (10), `event-store/replay-reader.test.ts` (10), `event-store/canonical-serialization.test.ts` (4) [unit]; `integration/event-store/replay.test.ts` (1, real PG/testcontainers).

### Files modified
- `apps/api/src/model-gateway/index.ts` — export the retrieval adapter + curated-corpus surface (P2.7).
- `apps/api/src/event-store/index.ts` — export the resolver (P1.7) + replay reader / canonical serialization (P1.8) surface.

## Decisions made
- **P2.7 never-rejects divergence (load-bearing).** Unlike the generation/embedding adapters (throw `ProviderCallError` → gateway-rejected), retrieval terminal live failure (or no client) **falls back to the curated corpus** tagged `fallbackSourced` and never throws — the §6 RISK-004/005 demo-safety net. No gateway change needed (the adapter never throws). → LESSONS §29.
- **P2.7 pluggable seam, no vendor pin** (lead/user directive) — concrete live provider deferred to the §6 retrieval spike; the curated fallback is the always-available MVP default. `assertProviderCredentials` unchanged (curated needs no creds).
- **P2.7 `retrievalEvidenceRef` is adapter-owned + pure** — builds a frozen `EvidenceRef` anchored by a mandatory non-empty `eventId` (kernel rule over the permissive frozen schema, lesson 6); kind restricted to prior_art/signal.
- **P1.7 `langfuseObservationId`-only → `external_only`** (extension confirmed by orchestrator) — Langfuse is the §6/§13 non-authoritative side channel, so a langfuse-only ref is an outside-Postgres pointer that must fail closed exactly like an external `uri` (not `no_pointer`). Precedence: `eventId` → resolve/not_found; else `uri`|`langfuseObservationId` → `external_only`; else → `no_pointer`. → LESSONS §30 (replay-safety by construction: no external-fetch seam to call).
- **P1.8 validate-not-sort** — `replayEvents` asserts strictly-increasing (out_of_order, checked first) + contiguous-from-0 (gap) + `schemaVersion ≤ current` (schema_too_new); never re-sorts (re-sorting would mask a corrupted authoritative log). Folds `RunEventRow` directly — replay trusts the P1.3 write-time validation boundary (no envelope re-parse; keeps the clean 3-reason taxonomy). → LESSONS §31.
- **P1.8 canonical serialization is `toJSON`-aware** — honors `toJSON` like `JSON.stringify` (Date → ISO string), resolving the security-review [medium] where a Date collapsed to `{}` (silent false-equivalence). Fold-state contract: JSON-safe values + `toJSON`-normalized.

## Decisions explicitly NOT made (deferred)
- **No concrete live-search provider** (P2.7) — deferred to the §6 retrieval spike; seam-only now.
- **No shared `openai` client factory** (P2.6 carry) — rule-of-three before extracting; each adapter keeps its own factory.
- **No global by-eventId store read** (P1.7) — resolver is within-run (store surface stays `{append, readByRun}`).
- **No envelope re-parse on replay** (P1.8) — no 4th `malformed` integrity reason; that's P1.4's post-insert-tamper threat model, not replay's.
- **No projection folds shipped** (P1.8) — `replayRun` is generic; the real current-state/lineage reducers are P6's.

## TDD compliance
**Clean.** Every slice followed strict RED → Step-2.5 review → GREEN. RED confirmed for each new module (import-not-found for the right reason) before any implementation. Safety-adjacent/invariant slices (all five) each got a Step-8 security-reviewer fan-out. No test written after implementation; no TDD violation.

## Reachability
- **P2.7 retrieval** — `createRetrievalProviderCall` → `createGateway` no-schema path (`retrieval_provider_call_fits_gateway_no_schema_path`); pure `retrievalEvidenceRef`/`searchCuratedCorpus` consumed by P4/P5. First-impl P3.1 boot, first-consumers P4/P5 (lesson 20).
- **P1.7 resolver** — `createEventStore().readByRun` → `resolveEvidenceRef`; `createEvidenceResolver` wraps the real store. First consumers P6/PD + P1.8 replay.
- **P1.8 replay reader** — `createEventStore().readByRun` → `replayRun`; exercised on the **real-PG round-trip** in the integration test (append → read → replay → state-equivalence). First consumers P6 folds + PD replay-fallback.
- No tested-but-unwired gaps beyond the explicit lesson-20 P3.1/P4/P5/P6/PD deferrals.

## Open follow-ups (Step-9 categorized; routed hot — orchestrator owns the docs)
- **Lessons banked (orchestrator):** §29 (demo-safety fallback adapter — fallback-not-reject), §30 (replay-safety by construction), §31 (validate-not-sort an authoritative ordered log + toJSON-aware canonical-equivalence).
- **Architecture §6/§9 notes (orchestrator → routing ledger):** retrieval never-reject + pluggable seam; resolver fail-closed taxonomy + langfuse leg; replay `ReplayIntegrityError` taxonomy + validate-not-sort + canonical state-equivalence + "replay trusts the write-time boundary" + the fold-state contract.
- **Future TODO — P3.1 boot:** a **role-dispatching `providerCall`** composing the per-role adapters — generation/critic/judge/fusion → `createOpenRouterProviderCall`; embedding → `createOpenAIEmbeddingProviderCall`; retrieval → `createRetrievalProviderCall({ client: undefined, corpus: DEFAULT_PRIOR_ART_CORPUS })` — injected into `createGateway`, with `assertProviderCredentials(process.env)` first. `selectGateway({useStub:false})` wires here.
- **Future TODO — P4/P5:** call `retrievalEvidenceRef(item, persistedEventId, kind)` at persist time + `searchCuratedCorpus(..., {kind})` with the consumer's kind; held-out-judge load-path validation (existing carry-forward).
- **Future TODO — P6/PD:** inject real current-state/lineage folds into `replayRun`; PD recorded-event replay-fallback; evidence-walkthrough dereferences `evidenceRefs[]` via the resolver (fresh resolver per pass). Fold states must be JSON-safe (Dates normalized).
- **Future TODO — §6 retrieval spike (operational):** when a concrete live-search provider lands — env var in the live-client factory's fail-fast check; decide join-vs-optional for `assertProviderCredentials`; real per-role timeout + cost/rate-limit envelope (RISK-004/005).

## How to use what was built
- **Resolve an evidence ref:** `resolveEvidenceRef(ref, await store.readByRun(runId))` → `{resolved, payload, row}` or `{resolved:false, reason}`. For many derefs in a run, `createEvidenceResolver(store).resolve(runId, ref)`.
- **Replay a run:** `replayRun(await store.readByRun(runId), fold, init)` (or `createReplayReader(store).replayRun(runId, fold, init)`); compare two states with `canonicalSerialize(a) === canonicalSerialize(b)`.
- **Retrieval grounding:** `createRetrievalProviderCall({ registry, client?, corpus?, kind? })` → a `ProviderCallFn` for `createGateway`; the no-client path returns curated results.
