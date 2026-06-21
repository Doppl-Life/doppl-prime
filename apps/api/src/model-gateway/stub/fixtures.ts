import { z } from 'zod';
import type { ModelRole } from '@doppl/contracts';

/**
 * Deterministic per-role fixtures for the recorded/fake gateway (P2.9). Each role pairs the stub's own
 * VALID output with the schema that output satisfies, so the fake — running the REAL P2.4 discipline —
 * produces an `accepted` response for that role. All values are fixed module constants (no
 * `Date.now()`/`Math.random()`), so the stub is byte-deterministic / replayable.
 */

export const STUB_EMBEDDING_MODEL_ID = 'stub-embedding';
export const STUB_EMBEDDING_DIMENSION = 8;
// A fixed 8-dim vector — dependent tracks/replay see a stable, persistable embedding. The real
// text-embedding-3-small (1536-dim) arrives via the P2.6 adapter.
const STUB_EMBEDDING_VECTOR: readonly number[] = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08];

export interface RoleFixture {
  schema: z.ZodType;
  output: unknown;
}

const embeddingSchema = z.object({
  vector: z.array(z.number()),
  embeddingModelId: z.string(),
  dimension: z.number().int().positive(),
});

const retrievalSchema = z.object({
  results: z.array(
    z.object({ text: z.string(), source: z.string(), fallbackSourced: z.boolean() }),
  ),
});

/** One fixture per frozen `ModelRole` (closed 7-union) — the stub's seam contract for dependent tracks. */
export const ROLE_FIXTURES: Record<ModelRole, RoleFixture> = {
  population_generator: {
    schema: z.object({ idea: z.string() }),
    output: { idea: 'stub population idea' },
  },
  critic: {
    schema: z.object({ critique: z.string(), confidence: z.number() }),
    output: { critique: 'stub critique', confidence: 0.5 },
  },
  subtype_check: {
    schema: z.object({ pass: z.boolean() }),
    output: { pass: true },
  },
  embedding: {
    schema: embeddingSchema,
    output: {
      vector: [...STUB_EMBEDDING_VECTOR],
      embeddingModelId: STUB_EMBEDDING_MODEL_ID,
      dimension: STUB_EMBEDDING_DIMENSION,
    },
  },
  final_judge: {
    schema: z.object({ score: z.number() }),
    output: { score: 3 },
  },
  fusion_synthesis: {
    schema: z.object({ synthesis: z.string() }),
    output: { synthesis: 'stub fusion synthesis' },
  },
  retrieval: {
    schema: retrievalSchema,
    output: {
      results: [
        { text: 'stub curated passage', source: 'curated-fallback-corpus', fallbackSourced: true },
      ],
    },
  },
};

/**
 * Role-independent probe schema + outputs for the `repairable` / `reject` modes. The probe schema
 * requires `corrected: true`; the invalid output (`corrected: false`) fails it, the valid output
 * passes — so the REAL discipline drives one repair (repairable) or a rejection (reject).
 */
export const STUB_PROBE_SCHEMA = z.object({ corrected: z.literal(true) });
export const STUB_PROBE_INVALID_OUTPUT = { corrected: false };
export const STUB_PROBE_VALID_OUTPUT = { corrected: true };
