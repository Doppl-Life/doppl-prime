# /tdd brief — candidate_inspector

## Feature
The **candidate inspector** (§12) — loads a candidate via `runClient.getCandidate(runId, candidateId)` and renders the `CandidateIdea` fields (subtype, title, summary, claims[], evidenceRefs[], status) for **both subtypes** (CrossDomainTransfer + ZeitgeistSynthesis payloads). EvidenceRef links resolve **within the Postgres tier only** (eventId/uri pointers → authoritative events/projections, never an external store). A subtype-specific payload renders per its subtype without one subtype crashing the other; an unknown/missing payload field degrades gracefully. Candidate status uses the shared accessible primitive; the inspector is reachable from a lineage candidate node's `dataRef`.

## Use case + traceability
- **Task ID:** P7.10 (candidate inspector)
- **Architecture sections:** `ARCHITECTURE.md §12` (the inspector panel; accessible), `§9`/`§4` (EvidenceRef resolves within the Postgres tier — eventId/uri reference authoritative events/projections, never a non-authoritative external store).
- **Related context:** **Builds on P7.1** (`runClient.getCandidate` → `CandidateIdea`, Zod-validated; `CandidateIdea` already in the seam) + **P7.3** (status primitive) + **P7.7** (the lineage candidate node's `dataRef` is the entry). Consumes frozen `CandidateIdea` + the two subtype payloads + `EvidenceRef` (P0.5) — all read-only via the existing seam. Unit-first.

## Acceptance criteria
- [ ] Loads a candidate via `runClient.getCandidate(runId, candidateId)` (Zod-validated) and renders the common `CandidateIdea` fields (subtype, title, summary, claims[], status)
- [ ] **Both subtypes render** — the `CrossDomainTransferPayload` fields (sourceDomain/sourceTechnique/targetDomain/targetProblem/transferMapping/expectedMechanism) AND the `ZeitgeistSynthesisPayload` fields (thesis/audience/currentSignals[]/whyNow/falsifiablePredictions[]/comparablePriorArt[]) — discriminated on `subtype`; rendering one subtype never crashes on the other's shape; a missing/unknown field degrades gracefully (no throw/blank)
- [ ] **EvidenceRef links resolve within the Postgres tier only** — render the eventId/uri/label/langfuseObservationId pointers as in-tier references (the link target is an authoritative eventId/uri, NEVER an external store); the inspector never fabricates an external URL
- [ ] Candidate status uses the shared accessible primitive (shape+label+icon, rule #4); the inspector is reachable from a lineage candidate node's `dataRef` (a plain candidateId the shell wires)
- [ ] Adherence-clean (var() tokens, no raw hex); no apps/api import (rule #6); no secret
- [ ] Unit tests pass (happy-dom + injected runClient); count reported; `/preflight` (web) clean

## Wiring / entry point (Step 7.5)
**none — mounted by the P7.14 shell.** Reachable from the P7.7 lineage candidate node's `dataRef` (candidateId) at integration; exercised now against an injected `runClient.getCandidate` + both-subtype fixtures.

## Files expected to touch
**New:**
- `apps/web/src/panels/CandidateInspector.tsx` — the inspector (common fields + subtype-discriminated payload render + status primitive)
- `apps/web/src/panels/evidenceRef.tsx` — the EvidenceRef resolver/link (in-tier pointer render)
- `apps/web/test/unit/panels/{CandidateInspector,evidenceRef}.test.tsx`

**Modified:** none expected (`CandidateIdea`/subtypes/`EvidenceRef` already in the seam; consumes P7.1 getCandidate + P7.3).

If implementation needs files beyond this, **flag at Step 2.5**.

## RED test outline
1. **`test_loads_and_renders_common_fields`** — getCandidate → renders subtype/title/summary/claims/status (positive guard). Why: §12.
2. **`test_both_subtype_payloads_render`** — a CDT candidate renders the CDT fields; a Zeit candidate renders the Zeit fields; neither crashes on the other's shape; a missing field degrades gracefully. Why: §12 both-subtypes.
3. **`test_evidence_ref_resolves_in_tier`** — an EvidenceRef renders its eventId/uri as an in-tier reference; never an external URL. Why: §9/§4.
4. **`test_status_accessible`** — status via the shared primitive (shape+label+icon). Why: rule #4.
5. **`test_no_apps_api_import`** — structural (rule #6).

## Cross-doc invariant impact
- **Model field changes:** none (consumes frozen `CandidateIdea`/subtypes/`EvidenceRef` read-only — all already in the seam). **§2.5-seam:** none.
- **Orchestrator doc rows (Step 9):** likely none beyond apps/web §1–§6.

## Things to flag at Step 2.5
1. **Subtype render dispatch.** Default: discriminate on `candidate.subtype` (the frozen discriminant) → a per-subtype sub-component; an exhaustive switch with a graceful default (no throw on an unexpected subtype). Confirm.
2. **EvidenceRef in-tier render.** Default: render eventId/uri/label as text/in-app references (the link target is the authoritative pointer the shell resolves at integration); NEVER construct an external href. Confirm.
3. **Both-subtype fixtures.** Default: use the frozen `CANONICAL_FIXTURES` for both subtype candidates where they exist; else seed minimal both-subtype fixtures. Confirm.

## Dependencies + sequencing
- **Depends on:** P7.1 (getCandidate), P7.3 (status), P7.7 (lineage dataRef entry — `f290d6d`), frozen `CandidateIdea`/subtypes/`EvidenceRef` (P0.5). Independent of apps/api.
- **Blocks:** P7.13 (final-idea panel links to the candidate), P7.14 (shell mounts it).

## Estimated commit count
**1.** Feature slice (inspector + evidenceRef resolver). Not safety-invariant (read-only render; candidate text is DATA displayed, not interpolated into any instruction — but the UI just renders it, no model call). Step-8: code-quality phase-boundary; security optional (no secret/mutation; the EvidenceRef-in-tier-only is a rule-#9/§4 display discipline pinned by T3).

## Lessons-logged candidates anticipated
- Likely none beyond apps/web §1–§6. Possible: "EvidenceRef renders as an in-tier pointer only (eventId/uri → authoritative events/projections), never an external href" — I author hot if it adds.

## How to invoke
> web session oriented — `/tdd`. cwd `apps/web/`. Stage only `apps/web/...`. (Round-3 web slice 5 — after P7.9.)
1. **Run `/tdd candidate_inspector`.**
2. **Step 2.5** — answer the 3 questions, send the coverage map.
3. **Step 9** — surface anything beyond apps/web §1–§6.
