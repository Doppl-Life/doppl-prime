import { z } from 'zod';

/**
 * EvidenceKind — the CLOSED evidence-pointer union (ARCHITECTURE.md §4). What KIND of artifact an
 * `EvidenceRef` points at; any other kind is rejected.
 */
export const EvidenceKind = z.enum([
  'trace',
  'check_output',
  'prior_art',
  'signal',
  'raw_output',
  'other',
]);

export type EvidenceKind = z.infer<typeof EvidenceKind>;

/**
 * EvidenceRef — the explainability pointer carried by candidates, critic reviews (P0.6), and check
 * results (P0.7) so every judgement is traceable to persisted events (ARCHITECTURE.md §4/§8).
 *
 * The schema encodes a pointer SHAPE only — all pointer fields are optional (a `prior_art` ref may
 * be label-only) and EVERY pointer resolves WITHIN the Postgres tier; the resolution itself is the
 * P1.7 resolver's job, never the schema's (§9, lesson §6). Pointer strings are non-empty when
 * present, mirroring the `langfuseObservationId` convention on the event envelope.
 */
export const EvidenceRef = z.strictObject({
  kind: EvidenceKind,
  eventId: z.string().min(1).optional(),
  uri: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  langfuseObservationId: z.string().min(1).optional(),
});

export type EvidenceRef = z.infer<typeof EvidenceRef>;
