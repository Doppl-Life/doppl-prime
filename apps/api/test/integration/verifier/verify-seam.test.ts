import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  JudgeResult,
  validCandidateIdeaCrossDomain,
  validProviderMeta,
  type ModelGatewayRequest,
  type ModelGatewayResponse,
} from '@doppl/contracts';
import { createEventStore, type EventStore } from '../../../src/event-store';
import { CHECK_RUNNER_REGISTRY } from '../../../src/check-runners/registry';
import type { ModelGateway } from '../../../src/model-gateway';
import { loadConfig } from '../../../src/runtime/config/loadConfig';
import {
  runGenerationLoop,
  type GenerationGateway,
  type ReproduceSeam,
  type ScoreSeam,
} from '../../../src/runtime/loop/generationLoop';
import { createVerifySeam } from '../../../src/verifier/verify-seam';

/**
 * P4.12 unified VerifySeam adapter — integration (testcontainers, real PG). The LOAD-BEARING proof: the
 * REAL createVerifySeam, injected as seams.verify into the REAL runGenerationLoop, lands its critic /
 * check / judge events through the REAL P1.3 append path (no mocks on the truth log). spec(§5) loop+seam
 * composition; spec(§2.5/§7) the persisted judge.reviewed is a JudgeResult keyed by candidateId; spec(§9)
 * rule #7 re-reading the log re-calls no provider. Mirrors run-council.test.ts harness.
 */

const VALID_ENV: Record<string, string | undefined> = {
  OPENROUTER_API_KEY: 'or-key',
  OPENAI_API_KEY: 'oai-key',
  DATABASE_URL: 'postgres://localhost/db',
};

const PER_AXIS = {
  grounding: 4,
  novelty: 3,
  feasibility: 5,
  falsification_survival: 2,
  subtype_check_pass: 4,
};

// The candidate CONTENT the population_generator returns (kernel assigns id/runId/generationId/agenomeId/
// status) — a valid cross_domain_transfer idea, so candidate.created validates + the transfer checks run.
const CANDIDATE_CONTENT = {
  title: validCandidateIdeaCrossDomain.title,
  summary: validCandidateIdeaCrossDomain.summary,
  claims: validCandidateIdeaCrossDomain.claims,
  evidenceRefs: validCandidateIdeaCrossDomain.evidenceRefs,
  subtype: validCandidateIdeaCrossDomain.subtype,
  subtypePayload: validCandidateIdeaCrossDomain.subtypePayload,
};

const populationGateway: GenerationGateway = {
  generate: () =>
    Promise.resolve({
      response: {
        accepted: true,
        validationResult: 'accepted',
        output: CANDIDATE_CONTENT,
        providerMeta: validProviderMeta,
      },
    }),
};

// Multi-role fake gateway for the SEAM's council + judge (.call), with a provider-call counter for the
// replay assertion. (final_judge needs per-axis output — the P2.9 fixture's `{score:3}` is stale.)
function countingVerifyGateway() {
  let calls = 0;
  const gateway: ModelGateway = {
    call: (request: ModelGatewayRequest): Promise<ModelGatewayResponse> => {
      calls += 1;
      return Promise.resolve({
        accepted: true,
        validationResult: 'accepted',
        output:
          request.role === 'final_judge' ? PER_AXIS : { critique: 'stub critique', confidence: 0.5 },
        providerMeta: validProviderMeta,
      });
    },
    capabilityFor: () => ({ structuredOutputs: true, embeddings: true }),
  };
  return { gateway, calls: () => calls };
}

const noopScore: ScoreSeam = () => Promise.resolve();
const noopReproduce: ReproduceSeam = () => Promise.resolve();

function loopConfig() {
  return loadConfig({ env: VALID_ENV, fileSources: { caps: { maxGenerations: 1, maxPopulation: 2 } } });
}

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});

afterAll(async () => {
  await pool.end();
});

describe('createVerifySeam — driven by the REAL generation loop against real PG', () => {
  // spec(§5/§2.5/§7) — the real loop, with the real seam injected, persists per created candidate a
  // critic.reviewed, a check.completed, and a judge.reviewed whose payload is a JudgeResult keyed by the
  // candidate; the judge marker→terminal pair is in sequence order.
  test('test_real_loop_with_verify_seam_injected_persists_verifier_events', async () => {
    const runId = 'verify-seam-real-loop';
    const { gateway } = countingVerifyGateway();
    const verify = createVerifySeam({
      gateway,
      eventStore: store,
      registry: CHECK_RUNNER_REGISTRY,
      config: loopConfig(),
    });
    await runGenerationLoop({
      runId,
      config: loopConfig(),
      eventStore: store,
      gateway: populationGateway,
      seams: { verify, score: noopScore, reproduce: noopReproduce },
    });

    const rows = await store.readByRun(runId);
    const created = rows.filter((r) => r.type === 'candidate.created').map((r) => r.candidateId);
    expect(created.length).toBe(2);

    for (const cid of created) {
      const forC = rows.filter((r) => r.candidateId === cid);
      expect(forC.some((r) => r.type === 'critic.reviewed')).toBe(true);
      expect(forC.some((r) => r.type === 'check.completed')).toBe(true);
      const judged = forC.find((r) => r.type === 'judge.reviewed');
      expect(judged).toBeDefined();
      const parsed = JudgeResult.safeParse(judged?.payload);
      expect(parsed.success).toBe(true);
      expect(parsed.success ? parsed.data.candidateId : null).toBe(cid);

      // marker→terminal pairing in sequence order (judge.review_started precedes judge.reviewed).
      const started = forC.find((r) => r.type === 'judge.review_started');
      expect(started).toBeDefined();
      expect((started?.sequence ?? 0) < (judged?.sequence ?? 0)).toBe(true);
    }
  });

  // spec(§9) rule #7 — re-reading the persisted log (a replay-style read) reconstructs the verifier events
  // and re-calls NO provider: the gateway call-count is stable across re-reads.
  test('test_replay_no_provider_recall_on_verifier_events', async () => {
    const runId = 'verify-seam-replay';
    const { gateway, calls } = countingVerifyGateway();
    const verify = createVerifySeam({
      gateway,
      eventStore: store,
      registry: CHECK_RUNNER_REGISTRY,
      config: loopConfig(),
    });
    await runGenerationLoop({
      runId,
      config: loopConfig(),
      eventStore: store,
      gateway: populationGateway,
      seams: { verify, score: noopScore, reproduce: noopReproduce },
    });
    const afterRun = calls();
    expect(afterRun).toBeGreaterThan(0);

    const rows1 = await store.readByRun(runId);
    const rows2 = await store.readByRun(runId);
    expect(calls()).toBe(afterRun); // no provider re-call on a log re-read
    expect(rows2.length).toBe(rows1.length);
    expect(rows1.some((r) => r.type === 'judge.reviewed')).toBe(true);
  });
});
