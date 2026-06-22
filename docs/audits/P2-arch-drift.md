# P2 arch-drift audit — `/phase-exit P2` (2026-06-22)

**Auditor:** arch-drift-auditor (kernel orch dispatch). **Anchors:** `ARCHITECTURE.md §6` (model gateway: registry, OpenRouter, embeddings, retrieval), `§13` (observability — non-authoritative Langfuse), `§14` (secret redaction / injection isolation).

**Verdict: CLEAR** — 3 anchors audited, **0 DRIFT**, **2 STALE-DOC**, 0 ambiguous. All `spec(§6)/spec(§13)/spec(§14)`-tagged tests green.

> Note: the auditor returned its full per-statement findings as text rather than writing this file directly; this report captures its verdict + the load-bearing items. The per-statement evidence table is in the orchestrator transcript (round-5 phase-exit).

## §6 — Model gateway (VERIFIED)
- Domain/runtime sees only `ModelGatewayRequest/Response` + `ProviderCapability`; no vendor SDK leak (`port.ts` type-only seam; OpenAI SDK confined to the 2 adapter files). Pin: `port.test.ts`.
- Registry = closed 7-role `z.strictObject`; OpenRouter primary for generation/critic/judge/synthesis; embeddings pinned to direct-OpenAI `text-embedding-3-small`; `defaults<file<env`, fail-fast on missing role/env/dangling fallback. Pins: `registry.test.ts`.
- Structured-output discipline: accept / repair ≤1 (single `await`, no loop) / reject; PARSED value returned (§18); candidate text as DATA via `wrapUntrusted` (§23); `providerMeta` on accepted + rejected. Terminal `ProviderCallError` → rejected response, never a throw past the port (rule #8 zero-token meta). Pins: `structured-output.test.ts`, `gateway` adapter tests.
- Retrieval: vendor-free seam, curated-corpus fallback, never rejects (§29); embedding adapter returns vector+modelId+dimension for authoritative persistence (rule #7).

## §13 — Observability (VERIFIED + 1 STALE-DOC)
- Langfuse non-authoritative; failed export → local-only warn, NO event-log write; the emit boundary structurally cannot touch the authoritative log (import-ban pin). Kernel-logger stamps §4 correlation IDs; no external metrics stack. Pins: `packages/observability/test/*`.
- **STALE-DOC:** the §6/§13 prose+diagram imply the gateway live-exports trace IDs to Langfuse. The live export is the **approved P2.8 Phase-D re-home** (rule #2 — a projection subscriber off the event log, not the gateway write path); the gateway correctly does NOT populate `langfuseTraceId`. Code is right; the §6 diagram dashed arrow `GW -.trace IDs.-> LF` + the §6 prose are ahead of shipped state.

## §14 — Security / trust boundaries (VERIFIED)
- Single scrub before append (`append.ts` → `scrubEventPayload`) AND before Langfuse emit (`emit.ts` → `scrubObservabilityPayload`), ceiling-then-scrub order; env-value layer redacts keys+arrays+values with de-collision; pure (no env read); idempotent + non-mutating; §46 type-aware fix (number/boolean exempt) verified. Candidate-as-data injection isolation (§23/§38). Credentials env-only + structurally unrepresentable in the config strict objects (§27); no credential field in Request/Response.

## STALE-DOC items → cody-bound §6 reconcile (apply at the kernel→cody track-completion merge)
1. §6 diagram dashed arrow `GW -.trace IDs.-> LF[Langfuse]` — reword to reflect the P2.8 Phase-D re-home (gateway carries the `langfuseTraceId` seam; the live export is a bootstrap projection subscriber off the event log, rule #2).
2. §6/§13 prose "Langfuse trace/observation IDs are returned and persisted" — clarify: the IDs live in the envelope schema (optional) + verifier LLM events carry them (§41); the gateway does not live-export (Phase-D).

These are doc-ahead-of-code (NOT drift — the code is correct per the approved P2.8 Option-B re-home). Parked for the lead to apply at the merge alongside the §5/§6 arch notes (ledger §I).
