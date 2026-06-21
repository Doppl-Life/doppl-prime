import { z } from 'zod';
import { Subtype } from './subtype';
import { EvidenceRef } from './evidence-ref';
import { CrossDomainTransferPayload, ZeitgeistSynthesisPayload } from './subtype-payloads';

/**
 * CandidateStatus — the CLOSED 9-state candidate lifecycle (ARCHITECTURE.md §3 Candidate state
 * machine): `created → under_review → checked → scored → selected | rejected`; `→ culled` (lost a
 * generation) and `→ invalid` (failed schema validation) are terminal. Both subtypes share this one
 * lifecycle. The kernel (P3) drives the transitions; this freezes the state enum only.
 *
 * [P0.5-amend] `repairing` added (8→9, after `created`) so the §3 structured-output repair edge
 * `created → repairing → under_review` (on a successful repair) / `repairing → invalid` (repair budget
 * exhausted) is representable + persistable (CURRENT_SCHEMA_VERSION 3→4). Additive + backward-compatible
 * (closure preserved — unknown statuses still rejected).
 */
export const CandidateStatus = z.enum([
  'created',
  'repairing',
  'under_review',
  'checked',
  'scored',
  'selected',
  'rejected',
  'culled',
  'invalid',
]);

export type CandidateStatus = z.infer<typeof CandidateStatus>;

/**
 * The 9 fields every candidate shares regardless of subtype. Each variant adds the discriminant
 * `subtype` literal + its matching `subtypePayload` → 11 top-level fields total.
 *
 * The schema encodes SHAPE only — `claims` MAY be empty (a zero-claim candidate parses; ≥1-claim is a
 * COUNT invariant the kernel enforces WITH AN EVENT, lesson §6, same class as Agenome parentIds), and
 * lifecycle transitions are the kernel's, not the contract's.
 */
const candidateSharedShape = {
  id: z.string().min(1),
  runId: z.string().min(1),
  generationId: z.string().min(1),
  agenomeId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  claims: z.array(z.string().min(1)),
  evidenceRefs: z.array(EvidenceRef),
  status: CandidateStatus,
};

/**
 * CandidateIdea — the canonical unit of work (ARCHITECTURE.md §3, Appendix A). Modeled as a
 * `z.discriminatedUnion` on `subtype` so the `subtype ⟺ subtypePayload` correlation is structurally
 * unrepresentable-when-wrong: a `cross_domain_transfer` candidate MUST carry a
 * `CrossDomainTransferPayload` and a `zeitgeist_synthesis` candidate a `ZeitgeistSynthesisPayload` —
 * a mismatched pair cannot parse. The discriminant literals are sourced from the canonical P0.3
 * `Subtype` enum (never redefined, lesson §5).
 */
export const CandidateIdea = z.discriminatedUnion('subtype', [
  z.strictObject({
    ...candidateSharedShape,
    subtype: z.literal(Subtype.enum.cross_domain_transfer),
    subtypePayload: CrossDomainTransferPayload,
  }),
  z.strictObject({
    ...candidateSharedShape,
    subtype: z.literal(Subtype.enum.zeitgeist_synthesis),
    subtypePayload: ZeitgeistSynthesisPayload,
  }),
]);

export type CandidateIdea = z.infer<typeof CandidateIdea>;
