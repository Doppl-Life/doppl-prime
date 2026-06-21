import { z } from 'zod';
import { Subtype } from './subtype';
import { RunCaps } from '../run/run-caps';

/**
 * RunStatus — the CLOSED 8-member run-lifecycle union (ARCHITECTURE.md §3/§5, Appendix A). The P3
 * runtime kernel drives the transitions; this freezes the status enum only. Any other value rejected.
 */
export const RunStatus = z.enum([
  'configured',
  'running',
  'completing',
  'completed',
  'stopping',
  'stopped',
  'failed',
  'cancelled',
]);

export type RunStatus = z.infer<typeof RunStatus>;

/**
 * Run — the top-level run entity (ARCHITECTURE.md §3, Appendix A). Strict 7-field object (6 required +
 * `completedAt?` optional).
 *
 * `caps` is the frozen `RunCaps` (imported, never redefined — lesson §5; the kernel ENFORCES the caps,
 * rule #1 — this freezes the shape only). `enabledSubtypes` reuses the P0.3 `Subtype` union; ≥1-enabled
 * is a kernel COUNT rule (lesson §6), NOT a schema constraint, so the array is unbounded here. `seed` is
 * the opaque run/problem-scenario seed STRING (distinct from the numeric RNG seed `RunConfig.rngSeed`,
 * which is persisted in `run.configured` for replay, rule #7). `startedAt`/`completedAt?` are ISO-8601
 * UTC; `completedAt?` is omittable until the run terminates.
 */
export const Run = z.strictObject({
  id: z.string().min(1),
  seed: z.string().min(1),
  enabledSubtypes: z.array(Subtype),
  caps: RunCaps,
  status: RunStatus,
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().optional(),
});

export type Run = z.infer<typeof Run>;
