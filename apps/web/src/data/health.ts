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
/** Per-cap usage as the API reports it: a consumed total against the enforced ceiling. */
export const CapUsage = z.object({
  consumed: z.number(),
  ceiling: z.number(),
});

export const RunHealth = z.object({
  runId: z.string().min(1),
  /** Number of generations seen so far (the API's `generationCount`). */
  generationCount: z.number().int().nonnegative(),
  /** Candidates currently in flight (non-terminal candidate ideas). */
  candidatesInFlight: z.number().int().nonnegative(),
  /** ISO-8601 last-event time, or null when no events have folded yet. */
  lastEventAt: z.string().min(1).nullable(),
  /** Per-cap usage (cap name → {consumed, ceiling}); null until a run.configured cap set is known. The
   *  object is non-strict, so the API's extra fields (status, operationsInFlight, sequenceThrough) pass
   *  through without rejecting — fixing the integration carry-forward that left health permanently null. */
  capsConsumed: z.record(z.string(), CapUsage).nullable(),
});

export type RunHealth = z.infer<typeof RunHealth>;
