import { z } from 'zod';

/**
 * RunHealth — a WEB-LOCAL validation schema for `GET /runs/:id/health` (P6.8). This endpoint has NO
 * frozen `@doppl/contracts` model (the §11 health signal is API-owned; P0 is closed, so the demo track
 * can't add to the frozen contracts unilaterally — LESSONS §1 validate-every-payload + §34). It is built
 * to P6.8's documented shape; a non-strict object so the real response may carry extra fields without
 * rejecting (forward-tolerant for an evolving endpoint).
 *
 * INTEGRATION CARRY-FORWARD (demo→cody merge): reconcile this web-local shape against P6.8's REAL
 * response AND decide whether to PROMOTE RunHealth to a shared frozen contract (a lead/contract-
 * coordinated amendment, not a demo slice).
 */
export const RunHealth = z.object({
  runId: z.string().min(1),
  /** The current generation index (0-based). */
  currentGeneration: z.number().int().nonnegative(),
  /** Candidates currently in flight (unpaired generation-started markers). */
  candidatesInFlight: z.number().int().nonnegative(),
  /** ISO-8601 last-event time, or null when no events have folded yet. */
  lastEventAt: z.string().min(1).nullable(),
  /** Per-cap consumed totals (cap name → consumed); open record (the cap set is RunCaps'). */
  capsConsumed: z.record(z.string(), z.number()),
});

export type RunHealth = z.infer<typeof RunHealth>;
