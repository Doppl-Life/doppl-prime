import { z } from 'zod';
import { CandidateIdea } from '@doppl/contracts';

/**
 * CandidateContent (PD.10 commit 2, ARCHITECTURE.md §6) — the MODEL-OUTPUT shape the population_generator
 * is expected to return: a {@link CandidateIdea} MINUS the five kernel-assigned fields the generation loop
 * stamps onto `response.output` post-gateway (`generationLoop.ts` candidate.created assembly:
 * `{...response.output, id, runId, generationId, agenomeId, status}`).
 *
 * DERIVED from the frozen `CandidateIdea` via `.omit` on each discriminated-union member (single-source,
 * lesson §5 — no field is redefined here) → ZERO new contract surface (a runtime-local validation schema,
 * NOT a new Appendix-A model). Strict + subtype-discriminated, so the invariant holds EXACTLY:
 * `gateway-accepted content + the kernel fields == a valid CandidateIdea`. Passing this to the gateway's
 * validate/repair(≤1)/reject means a REJECT is precisely "an output that would have failed the
 * candidate.created append" — turning a mid-run worker throw into a graceful `agenome.failed`.
 */
const KERNEL_ASSIGNED = {
  id: true,
  runId: true,
  generationId: true,
  agenomeId: true,
  status: true,
} as const;

export const CandidateContent = z.discriminatedUnion('subtype', [
  CandidateIdea.options[0].omit(KERNEL_ASSIGNED),
  CandidateIdea.options[1].omit(KERNEL_ASSIGNED),
]);

export type CandidateContent = z.infer<typeof CandidateContent>;
