import { z } from 'zod';

/**
 * Actor — the closed 7-role union for the `actor` field on every {@link RunEventEnvelope}.
 *
 * Canonical per ARCHITECTURE.md §4 (supersedes the draft's `actor: string`). Any value
 * outside the seven roles is rejected at the persistence boundary.
 */
export const Actor = z.enum([
  'operator',
  'runtime',
  'agenome',
  'critic',
  'check_runner',
  'selection_controller',
  'system',
]);

export type ActorRole = z.infer<typeof Actor>;
