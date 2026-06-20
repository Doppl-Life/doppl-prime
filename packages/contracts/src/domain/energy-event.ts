import { z } from 'zod';
import { ProviderMeta } from '../gateway/provider-meta';

/**
 * EnergyEventType — the CLOSED 3-member union of productive-spend kinds (ARCHITECTURE.md §4).
 * Crucially there is NO failure member — a failed attempt is a separate `provider_call_failed` event,
 * never an `energy.spent` (rule #8).
 */
export const EnergyEventType = z.enum(['llm', 'tool', 'spawn']);

export type EnergyEventType = z.infer<typeof EnergyEventType>;

/**
 * EnergyEvent — a record of SUCCESSFUL productive spend (ARCHITECTURE.md §4/§5, Appendix A line 477).
 * Strict 10-field object.
 *
 * KEY SAFETY RULE #8 (energy = successful productive spend only): failed/retried/repaired attempts do
 * NOT debit energy — so this event carries NO failure/retry/repair/success debit field (unrepresentable
 * by `strictObject`, lesson §9), and it persists BOTH the pre-call `estimate` and the post-call
 * reconciled `actual`. The schema encodes SHAPE only — energy nonnegativity is a kernel rule (§6); the
 * `doppl_energy` unit (an integer, shared with `RunCaps.energyBudget`) is fixed by `z.literal`.
 */
export const EnergyEvent = z.strictObject({
  id: z.string().min(1),
  runId: z.string().min(1),
  generationId: z.string().min(1).optional(),
  agenomeId: z.string().min(1).optional(),
  eventType: EnergyEventType,
  estimate: z.int(),
  actual: z.int(),
  unit: z.literal('doppl_energy'),
  reason: z.string().min(1),
  providerMeta: ProviderMeta.optional(),
});

export type EnergyEvent = z.infer<typeof EnergyEvent>;
