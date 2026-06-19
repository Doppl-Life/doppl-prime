import { z } from "zod";

/**
 * EnergyEvent (ARCHITECTURE.md §4/§5, IMPLEMENTATION_PLAN.md P0.9).
 *
 * Success-only invariant: this shape models ONLY successful productive
 * spend. There is no `failed` / `retried` / `repaired` field — failed
 * attempts emit `provider_call_failed`, never `energy.spent` (§4). The
 * §2.5 snapshot encodes the absence of those fields; adding one breaks
 * the snapshot, which is the intended alarm.
 *
 * `unit` is the literal `"doppl_energy"` so the shared unit across
 * EnergyEvent + RunCaps.energyBudget cannot drift.
 */

export const EnergyEventTypeValues = ["llm", "tool", "spawn"] as const;
export const EnergyEventType = z.enum(EnergyEventTypeValues);
export type EnergyEventType = z.infer<typeof EnergyEventType>;

export const EnergyEvent = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    generationId: z.string().min(1).optional(),
    agenomeId: z.string().min(1).optional(),
    eventType: EnergyEventType,
    estimate: z.number().int().nonnegative(),
    actual: z.number().int().nonnegative(),
    unit: z.literal("doppl_energy"),
    reason: z.string(),
    providerMeta: z.unknown().optional(),
  })
  .strict();
export type EnergyEvent = z.infer<typeof EnergyEvent>;
