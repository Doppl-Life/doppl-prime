import { z } from "zod";

/**
 * EvidenceRef — a pointer to evidence backing a candidate, critic, or
 * check_result. Per ARCHITECTURE.md §4/§9 and IMPLEMENTATION_PLAN.md P0.5,
 * every kind resolves WITHIN the Postgres tier (never an external store).
 *
 * All locator fields (eventId, uri, langfuseObservationId) are optional at
 * the schema level — runtime resolution picks the first present locator.
 */

export const EvidenceKindValues = [
  "trace",
  "check_output",
  "prior_art",
  "signal",
  "raw_output",
  "other",
] as const;

export const EvidenceKind = z.enum(EvidenceKindValues);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

export const EvidenceRef = z
  .object({
    kind: EvidenceKind,
    eventId: z.string().min(1).optional(),
    uri: z.string().min(1).optional(),
    label: z.string().optional(),
    langfuseObservationId: z.string().min(1).optional(),
  })
  .strict();
export type EvidenceRef = z.infer<typeof EvidenceRef>;
