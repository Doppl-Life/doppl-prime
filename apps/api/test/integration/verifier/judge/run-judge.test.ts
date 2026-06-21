import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { validCandidateIdeaCrossDomain, validProviderMeta } from '@doppl/contracts';
import { createEventStore, type EventStore } from '../../../../src/event-store';
import { createFakeGateway, type ModelGateway } from '../../../../src/model-gateway';
import { runJudge } from '../../../../src/verifier/judge/judge-call';

/**
 * P4.8 held-out judge runner — integration (testcontainers, real PG). Invariant-touching (rule #5
 * isolation + rule #6 immutable judge). spec(§4) the judge.review_started marker lands via the real P1.3
 * append path with NO energy debit; spec(§7) a rejected output emits output_schema_rejected. There is NO
 * judge.reviewed / fitness.scored here (selection P5 owns fitness.scored). Mirrors append.test.ts.
 */

const PER_AXIS_OUTPUT = {
  grounding: 4,
  novelty: 3,
  feasibility: 5,
  falsification_survival: 2,
  subtype_check_pass: 4,
};

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;

function judgeGateway(output: unknown): ModelGateway {
  return {
    call: () =>
      Promise.resolve({
        accepted: true,
        validationResult: 'accepted' as const,
        output,
        providerMeta: validProviderMeta,
      }),
    capabilityFor: () => ({ structuredOutputs: true, embeddings: true }),
  };
}

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

describe('runJudge — events through the real append path', () => {
  // spec(§4) rule #8 — the valid path emits exactly one judge.review_started (actor selection_controller,
  // generic payload) and NO energy.spent / fitness.scored (the acceptance is RETURNED, not persisted here).
  test('test_judge_review_started_emitted_no_energy', async () => {
    const runId = 'run-judge-marker';
    const acc = await runJudge({
      gateway: judgeGateway(PER_AXIS_OUTPUT),
      store,
      candidate: validCandidateIdeaCrossDomain,
      runContext: runContext(runId),
    });
    expect(acc?.acceptanceMetric).toBe(18);
    const rows = await store.readByRun(runId);
    expect(rows.map((r) => r.type)).toEqual(['judge.review_started']);
    expect(rows[0]?.actor).toBe('selection_controller');
    const types = rows.map((r) => r.type);
    expect(types).not.toContain('energy.spent');
    expect(types).not.toContain('fitness.scored');
    expect(types).not.toContain('judge.reviewed');
  });

  // spec(§7) — a rejected judge output emits output_schema_rejected (after the started marker), no
  // acceptance result (null) — never a silent pass or fabricated score.
  test('test_rejection_emits_output_schema_rejected', async () => {
    const runId = 'run-judge-reject';
    const acc = await runJudge({
      gateway: createFakeGateway({ mode: 'reject' }),
      store,
      candidate: validCandidateIdeaCrossDomain,
      runContext: runContext(runId),
    });
    expect(acc).toBeNull();
    const types = (await store.readByRun(runId)).map((r) => r.type);
    expect(types).toEqual(['judge.review_started', 'output_schema_rejected']);
  });
});
