# Gap-audit disposition ledger

How every finding from the 16-agent audit was dispositioned in the finalized `ARCHITECTURE.md`. Nothing was silently dropped. **Any "default-adopted" row can be flipped — tell me which and I'll revise the contract.**

Audit tally: **22 critical · 48 important · 22 nice-to-have · 6 proposed-edit · 22 question-for-human.**

## The 22 question-for-human findings

Legend: **ASKED** = brought to the §4 human gate (answered). **DEFAULT** = resolved with the audit's recommended MVP default, folded into ARCHITECTURE.md. **OPEN→§20** = genuine post-spike unknown, recorded with a fallback.

| # | Dimension | Question | Disposition | Landed |
|---|---|---|---|---|
| 1 | D1 | Held-out rubric + scoring weights | **ASKED Q1** → held-out judge + critic rotation; 5-axis rubric. Weight *values* OPEN→§20 (structure frozen) | §7, §8, §20 |
| 2 | D1 | live-room vs prepared prompt / problem sets / streaming-vs-polling | **ASKED Q3** (prepared + optional-live); SSE+polling **DEFAULT**; exact problem sets OPEN→§20 | §11, §17, §20 |
| 3 | D2 | Zero-survivors → terminal `failed` vs `completed-no-winner` | **DEFAULT**: `completed` if any best-so-far was ever selected; `failed` only if none | §3 |
| 4 | D3 | Demo fallback ladder order/trigger | **DEFAULT**: operator-driven ladder (low-cap live → prepared → labeled replay) | §17 |
| 5 | D3 | Do failed/retried calls debit energy? | **USER-OVERRIDE**: NO — energy = successful productive spend only; failures bounded by retry count + timeout + wall-clock cap (finiteness preserved) | §4, §5 |
| 6 | D4 | Contracts authoring: TS vs Zod vs JSON Schema | **DEFAULT**: Zod + `z.infer` | §4 |
| 7 | D5 | Where embedding vectors live if pgvector deferred | **DEFAULT**: persist vector in `novelty.scored` (authoritative-once-computed) | §9 |
| 8 | D6 | Zeitgeist grounding source | **ASKED Q2** → live web retrieval **+ curated-corpus/replay fallback** | §6, §7 |
| 9 | D7 | Repo/package structure | **DEFAULT**: pnpm monorepo, import-rule boundaries | §2.5 |
| 10 | D7 | Worker model (in-process vs queue) | **DEFAULT**: in-process, idempotent; queue deferred | §5 |
| 11 | D8 | Hosted committed vs stretch | **ASKED Q3** → local-first; hosted deferred stretch | §17 |
| 12 | D9 | Langfuse trace-correlation: CI vs manual | **DEFAULT**: manual smoke; CI asserts trace-id field + clean degrade | §16 |
| 13 | D10 | Thin access control required? | **ASKED Q3** → local-first, no auth build; gate seam if hosted | §14, §17 |
| 14 | D11 | Does deployment env mandate auth? | **ASKED Q3** → local/no public URL → no auth | §14 |
| 15 | D11 | Reviewer-submitted live seed prompt? | **ASKED Q3 + DEFAULT**: operator-only seed entry (operator types room prompt) | §14, §17 |
| 16 | D12 | Polished/demo-deck diagrams in scope? | **DEFAULT**: defer; only the 7 P0 Mermaid in the contract | §21 |
| 17 | D13 | Spec Anchor Index include deferred REQs? | **DEFAULT**: include ALL REQ-*; deferred map to §18 | Spec Anchor Index |
| 18 | D14 | Package layout (dup of #9) | **DEFAULT**: same as #9 | §2.5 |
| 19 | D14 | Worker model (dup of #10) | **DEFAULT**: same as #10 | §5 |
| 20 | D15 | 10-min window not decomposed | **DEFAULT**: wall-clock cap + low-cap live override (budget the live segment to a few min) | §15, §17 |
| 21 | D16 | Concurrent runs vs serialize one | **USER-CONFIRMED**: serialize one active run (MVP); concurrent multi-run is an explicit stretch (§18) | §5, §18 |
| 22 | D16 | Audience-prompt content → Langfuse/log policy | **ASKED Q3** → non-sensitive + operator content toggle | §13, §15 |

**Net:** ASKED forks resolve #1, #2, #8, #11, #13, #14, #15, #22. User-adjusted post-gate: #5 (no energy on failures), #21 (serialize first, concurrent stretch). DEFAULT-adopted: #3, #4, #6, #7, #9, #10, #12, #16, #17, #18, #19, #20. Genuinely OPEN→§20 (post-spike, can't decide now without provider data): scoring-weight *values*, exact OpenRouter model routes, retrieval-provider choice + cost/rate-limit envelope, pop/gen/token/time defaults, pgvector day-one, Neo4j spike queries, Rule-of-Cool reuse depth, exact demo problem sets. None block the contract freeze.

## Critical findings (22) — all resolved in ARCHITECTURE.md

- **Replay integrity:** RNG/non-determinism capture (§4), embeddings authoritative-once-computed (§4/§9), closed `RunEventType` incl. failure events (§4/App A), `schemaVersion` policy + Postgres migration tool (§4/§9), replay-determinism contract (§4/§16).
- **Freeze-first contracts:** energy unit + cost map (§4), `RunEventType` enum, `FitnessScore`/`ScoringPolicy`/`Agenome`/`CriticReview`/`CheckResult`/`ModelGateway*`/`ProviderCapability`/`RunCaps`/`EvidenceRef` shapes + `actor` union (App A).
- **Runtime failure paths:** zero-survivors, repair edge, <2-parent fusion fallback, crash-forward, embedding-failure degrade, energy-exhaustion, wall-clock abort, retry policy (§3/§5).
- **DAG/anchors/diagrams:** explicit edge-set §2.5, REQ→§ Spec Anchor Index, anchor remap, P0 Mermaid embedded.
- **Security mechanisms:** candidate-as-data isolation (§7), check-runner allowlist registry (§7), redaction filter at persistence boundary (§14).
- **External dep:** retrieval grounding source resolved via Q2 (§6).
- **Held-out judge/rubric** (the acceptance instrument): Q1 (§7/§8).

## Important (48) / nice-to-have (22) / proposed-edit (6)

- **Important** folded into the doc: model-gateway cross-edges surfaced (§2.5), check-runners as distinct subsystem (§2.5/§7), `actor` union canonical (§4), spawn_budget clamped by caps (§5), raw/normalized outputs inline + `EvidenceRef` (§4/§9), retrieval/embeddings/rate-limit deps (§6/§18), contract & safety tests (§16), migration + replay-fixture pipeline + local/hosted parity (§9/§17), security mechanisms (§14), Mermaid embedding + anchor remap (§21/remap), clock authority + runtime self-observability + seed authoring + schema/policy migration + data-retention policy (§4/§13/§15, REQ-F-017). New REQs: **REQ-F-016** (held-out judge), **REQ-F-017** (gen-0 baseline), **REQ-DEF-010** (learned value model deferred); **REQ-F-008** tightened (novelty required).
- **Nice-to-have** adopted where cheap: dashboard accessibility/projector-safe (§12), energy estimate/actual reconciliation (§4), config validation + fail-fast (§15), canonical projection list (§9), capability-matrix lean start (§6), in-process-worker explicitness (§5). A few cosmetic ones (e.g. Langfuse-export-failure local warning) noted, not load-bearing.
- **Proposed-edits** applied: REQ-F-008 wording, §14↔REQ-T cross-refs (§16), canonical projection list, hot-path/budget cross-ref (§15), DAG import-rule restatement (§2.5).
