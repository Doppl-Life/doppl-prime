import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CriticReview, validCandidateIdeaCrossDomain } from '@doppl/contracts';
import { createEventStore, type EventStore } from '../../../../src/event-store';
import { createFakeGateway } from '../../../../src/model-gateway';
import { runCouncil } from '../../../../src/verifier/council/run-council';

/**
 * P4.6 critic council — integration (testcontainers, real PG). Invariant-touching (rule #5 isolation +
 * rule #6 emit-only + authoritative persistence). spec(§4) critic.review_started→critic.reviewed marker
 * pairing through the real P1.3 append path; spec(§7) persisted review = validated CriticReview. Mirrors
 * append.test.ts.
 */

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;

function runContext(runId: string) {
  return { runId, generationId: 'gen_1', candidateId: validCandidateIdeaCrossDomain.id };
}

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});

afterAll(async () => {
  await pool.end();
});

describe('runCouncil — events through the real append path', () => {
  // spec(§4) — per mandate, critic.review_started (actor critic) at sequence N then critic.reviewed at
  // N+1, in order (operation-start marker pairing).
  test('test_review_started_then_reviewed_per_mandate_in_order', async () => {
    const runId = 'run-council-order';
    await runCouncil({
      gateway: createFakeGateway(),
      store,
      candidate: validCandidateIdeaCrossDomain,
      mandates: ['factual_grounding'],
      runContext: runContext(runId),
    });
    const rows = await store.readByRun(runId);
    expect(rows.map((r) => r.type)).toEqual(['critic.review_started', 'critic.reviewed']);
    expect(rows.map((r) => r.sequence)).toEqual([0, 1]);
    expect(rows.map((r) => r.actor)).toEqual(['critic', 'critic']);
  });

  // spec(§7) — the persisted critic.reviewed payload is a validated CriticReview equal to the assembled
  // review (producer-agreement, lesson 20); provider-call metadata is present on the envelope.
  test('test_reviewed_payload_is_validated_review_with_provider_meta', async () => {
    const runId = 'run-council-payload';
    const reviews = await runCouncil({
      gateway: createFakeGateway(),
      store,
      candidate: validCandidateIdeaCrossDomain,
      mandates: ['factual_grounding'],
      runContext: runContext(runId),
    });
    const rows = await store.readByRun(runId);
    const reviewed = rows.find((r) => r.type === 'critic.reviewed');
    const parsed = CriticReview.safeParse(reviewed?.payload);
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data : null).toEqual(reviews[0]);
    // provider-call correlation persisted on the envelope (the response's providerMeta.gatewayRequestId).
    expect(typeof reviewed?.correlationId).toBe('string');
    expect((reviewed?.correlationId ?? '').length).toBeGreaterThan(0);
  });

  // spec(§7) — a rejected mandate emits output_schema_rejected, NO critic.reviewed (no silent pass / no
  // fabricated review).
  test('test_rejection_emits_output_schema_rejected_no_reviewed', async () => {
    const runId = 'run-council-reject';
    const reviews = await runCouncil({
      gateway: createFakeGateway({ mode: 'reject' }),
      store,
      candidate: validCandidateIdeaCrossDomain,
      mandates: ['factual_grounding'],
      runContext: runContext(runId),
    });
    expect(reviews).toEqual([]);
    const types = (await store.readByRun(runId)).map((r) => r.type);
    expect(types).toEqual(['critic.review_started', 'output_schema_rejected']);
    expect(types).not.toContain('critic.reviewed');
  });

  // spec(§4) rule #8 — the council debits NO energy: no energy.spent for the run (energy is P3's ledger).
  test('test_council_marker_debits_no_energy', async () => {
    const runId = 'run-council-energy';
    await runCouncil({
      gateway: createFakeGateway(),
      store,
      candidate: validCandidateIdeaCrossDomain,
      mandates: ['factual_grounding', 'feasibility'],
      runContext: runContext(runId),
    });
    const types = (await store.readByRun(runId)).map((r) => r.type);
    expect(types).not.toContain('energy.spent');
  });
});
