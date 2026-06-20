import { z } from 'zod';

/**
 * ModelRole — the CLOSED 7-member union of gateway routing roles (ARCHITECTURE.md §6). Every model
 * call is routed by role; the gateway is the only provider seam, so domain code names a role, never a
 * provider/model. Any other value is rejected.
 */
export const ModelRole = z.enum([
  'population_generator',
  'critic',
  'subtype_check',
  'embedding',
  'final_judge',
  'fusion_synthesis',
  'retrieval',
]);

export type ModelRole = z.infer<typeof ModelRole>;
