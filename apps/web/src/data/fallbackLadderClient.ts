import { z } from 'zod';
import { RunCaps, RunConfig } from './contracts';

/**
 * RungDescriptor — a WEB-LOCAL validation mirror of the api `runtime/demo` fallback-ladder descriptors
 * served by GET /demo/fallback-ladder (PD.12). Like `ProblemSet`/`RunHealth`, the ladder rung is api
 * runtime config, NOT a frozen Appendix-A model (P0 is closed) → mirrored web-locally. The payloads
 * COMPOSE the frozen `RunCaps`/`RunConfig` schemas (read-only consumption via the contracts seam — never
 * redefined). A discriminated union on `kind`, so a malformed rung surfaces as a typed validation error.
 */
export const LowCapLiveRung = z.object({
  kind: z.literal('low-cap-live'),
  mode: z.literal('live'),
  caps: RunCaps,
});
export const PreparedRung = z.object({
  kind: z.literal('prepared'),
  mode: z.literal('live'),
  runConfig: RunConfig,
});
export const ReplayRung = z.object({
  kind: z.literal('replay'),
  mode: z.literal('replay'),
  replayRunId: z.string().min(1),
});

export const RungDescriptor = z.discriminatedUnion('kind', [
  LowCapLiveRung,
  PreparedRung,
  ReplayRung,
]);
export type RungDescriptor = z.infer<typeof RungDescriptor>;

/** The GET /demo/fallback-ladder response envelope: `{ rungs: RungDescriptor[] }`. */
export const FallbackLadderResponse = z.object({ rungs: z.array(RungDescriptor) });
export type FallbackLadderResponse = z.infer<typeof FallbackLadderResponse>;
