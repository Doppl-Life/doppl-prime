import { z } from 'zod';

/**
 * Subtype — the CLOSED candidate-subtype union (ARCHITECTURE.md §3/§4). The two breeding subtypes
 * share one lifecycle. Defined canonically here; `RunConfig.enabledSubtypes` references it and
 * P0.5's `CandidateIdea.subtype` imports the SAME union (single source of truth — never redefined).
 */
export const Subtype = z.enum(['cross_domain_transfer', 'zeitgeist_synthesis']);

export type Subtype = z.infer<typeof Subtype>;
