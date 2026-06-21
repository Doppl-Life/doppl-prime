import { describe, expect, test } from 'vitest';
import { createFakeGateway } from '../../../../src/model-gateway';
import type { ModelGateway } from '../../../../src/model-gateway';
import type { ModelGatewayRequest } from '@doppl/contracts';
import {
  STUB_EMBEDDING_DIMENSION,
  STUB_EMBEDDING_MODEL_ID,
} from '../../../../src/model-gateway/stub/fixtures';
import { embed } from '../../../../src/selection/novelty/embed';

/**
 * embed — the SOLE gateway-touching novelty function (P5.2). Routes through the ModelGateway
 * `embedding` role (port-only — no provider SDK, rule #9) and returns the authoritative-once-computed
 * vector + provenance, or a defined failure the P5.3 degrade path wraps.
 */
describe('embed — novelty embedding via the ModelGateway port', () => {
  // 8 — spec(§8): embed issues an `embedding`-role request carrying the summary as the prompt.
  test('embed_calls_embedding_role_with_summary', async () => {
    const base = createFakeGateway({ mode: 'valid' });
    let seen: ModelGatewayRequest | undefined;
    const gateway: ModelGateway = {
      call: (req) => {
        seen = req;
        return base.call(req);
      },
      capabilityFor: base.capabilityFor,
    };
    await embed('a novel candidate summary', { gateway });
    expect(seen?.role).toBe('embedding');
    expect(seen?.prompt).toBe('a novel candidate summary');
  });

  // 9 — spec(§9): embed returns the stub's {vector(8), 'stub-embedding', 8} from the accepted response.
  test('embed_returns_vector_modelid_dimension', async () => {
    const gateway = createFakeGateway({ mode: 'valid' });
    const result = await embed('summary', { gateway });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.vector).toHaveLength(STUB_EMBEDDING_DIMENSION);
      expect(result.embeddingModelId).toBe(STUB_EMBEDDING_MODEL_ID);
      expect(result.dimension).toBe(STUB_EMBEDDING_DIMENSION);
    }
  });

  // 10 — spec(§8): a non-accepted (reject-mode) response yields a defined failure signal — not a
  // silent zero vector, not a secret-leaking throw — the seam P5.3's degrade path builds on.
  test('embed_non_accepted_is_defined_failure', async () => {
    const gateway = createFakeGateway({ mode: 'reject' });
    const result = await embed('summary', { gateway });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.reason).toBe('string');
      expect(result.reason.length).toBeGreaterThan(0);
      // not a silent zero: a failure carries no vector field.
      expect('vector' in result).toBe(false);
    }
  });
});
