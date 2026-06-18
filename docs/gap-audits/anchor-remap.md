# Draft → Final anchor remap

`ARCHITECTURE_DRAFT.md` used a `§1, §1A, §2…§23` + `§4A` scheme. The finalized `ARCHITECTURE.md` conforms to the canonical template (`§1`, `§2`, `§2.5` = the DAG/parallelization seam, then `§3…§N`, a REQ→§ Spec Anchor Index, and Appendix A). This table is the lookup used to rewrite every dangling reference in `DECISIONS.md` ("Related Architecture Anchors") and `DIAGRAM_PLAN.md` ("Spec anchors"). References should target `ARCHITECTURE.md`, not the draft.

| Draft anchor | Final anchor | Notes |
|---|---|---|
| §1 Executive Summary | Executive summary (doc head) | — |
| §1A Goals And Non-Goals | §1 Goals & non-goals | — |
| §2 Product Definition And Scope | §1 (scope) + §3 (CandidateIdea + lifecycle) | split |
| §3 Locked Architecture Decisions | §19 Alternatives & locked decisions | summary lives in §19; ADRs stay in DECISIONS.md |
| §4 System Overview | §2 System overview | + embedded Mermaid |
| §4A Subsystem Dependency DAG & Parallelization Seams | **§2.5** | **load-bearing remap**; now an explicit edge-set + independent-tracks + surface ownership |
| §5 Domain Model | §3 Domain model & lifecycle state machines | — |
| §6 Core Modules | §5 (kernel) + §6 (gateway) + §7 (verifier/checks) + §8 (selection/reproduction) + §9 (persistence) | split by subsystem |
| §7 Data And State Model | §4 Contracts & event model (+ §3 state machines) | — |
| §8 User Flows | §11 Backend API & flows | flows summarized; detail in USER_FLOWS.md |
| §9 Integration Architecture | §6 Model gateway & provider integration | — |
| §10 Automation / Background Jobs | §5 Runtime kernel (workers) + §13 Observability | — |
| §11 Frontend Architecture | §12 Frontend dashboard | — |
| §12 Backend / API Strategy | §11 Backend API | — |
| §13 Shared Package / Config Strategy | §2.5 (repo shape) + §15 (config) | split |
| §14 Testing Strategy | §16 Testing strategy | — |
| §15 Security And Risk | §14 Security & trust boundaries | — |
| §16 Deployment And Demo Strategy | §17 Deployment & demo strategy | — |
| §17 Alternatives Considered | §19 Alternatives & locked decisions | — |
| §18 Scope Boundaries And Deferred Work | §18 Scope boundaries & deferred work | — |
| §19 Diagrams | §21 Diagrams index | P0 diagrams embedded in their owning sections |
| §20 Repo Scaffold | §2.5 Parallelization seams (repo shape) | — |
| §21 Decision Summary Table | §19 Alternatives & locked decisions | — |
| §22 Spec Anchor Index (was a TOC) | **Spec Anchor Index** (now REQ→§) | repurposed to true traceability |
| §23 Claude Code Review Instructions | (removed) | finalization complete |

## DECISIONS.md "Related Architecture Anchors" rewrites

| ADR | Draft anchors | Final anchors |
|---|---|---|
| ADR-001 Posture | §1, §15 | §1, §14 |
| ADR-002 Custom kernel | §3, §4, §6 | §2, §5 |
| ADR-003 Postgres event log | §5, §7, §11 | §3, §4, §9 |
| ADR-004 Provider gateway | §8, §9, §10 | §6, §11 |
| ADR-005 Langfuse | §10, §13 | §13 |
| ADR-006 Novelty | §9 | §8 |
| ADR-007 Lineage/Neo4j | §7, §12 | §9, §10 |
| ADR-008 React Flow | §12 | §12 |
| ADR-009 Local-first + hosted | §14 | §17 |
| ADR-010 REST + SSE | §8, §11, §12 | §11, §12 |

## DIAGRAM_PLAN.md "Spec anchors" rewrites (draft → final, `ARCHITECTURE.md`)

- Full-scope diagram: 1,3,4,4A,6,7,9,11,12,15,16,17,18,20 → §2, §2.5, §4, §5, §6, §9, §11, §12, §14, §17, §19
- Run lifecycle: 2,5,6,8,10,14 → §3, §4, §5, §7, §16
- Event/replay: 7,10,11,12,15 → §4, §9, §11, §12, §14
- Model gateway: 3,6,9,13,17 → §6, §19
- Lineage/Neo4j: 7,11,17,18 → §9, §10, §18, §19
- Dashboard data plane: 8,11,12,16 → §11, §12, §17
- Trust boundaries: 15 → §14
- Parallel build DAG: 4A,13,14,20 → §2.5, §16
- Deployment/demo: 16 → §17
- Scoring/novelty/verifier: 6,9,14,15 → §7, §8, §14, §16
- Repo scaffold: 13,20,22 → §2.5
