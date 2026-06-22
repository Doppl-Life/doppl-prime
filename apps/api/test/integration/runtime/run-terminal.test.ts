import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  CURRENT_SCHEMA_VERSION,
  validCandidateIdeaCrossDomain,
  validFitnessScore,
  validNoveltyScore,
  validProviderMeta,
} from '@doppl/contracts';
import type { ModelGatewayResponse } from '@doppl/contracts';
import { createEventStore, type EventStore } from '../../../src/event-store';
import { loadConfig } from '../../../src/runtime/config/loadConfig';
import {
  runGenerationLoop,
  type GenerationGateway,
  type ReproduceSeam,
  type ScoreSeam,
  type VerifySeam,
} from '../../../src/runtime/loop/generationLoop';

/**
 * P3.11 run-terminal classification — integration (testcontainers, real PG). The loop-exit executor
 * classifies the run-terminal verdict over the REAL persisted log and appends EXACTLY ONE run.completed
 * (with finalIdeaRef) through the authoritative append path (rule #2 — no in-place edit, sequence-ordered).
 */

const VALID_ENV: Record<string, string | undefined> = {
  OPENROUTER_API_KEY: 'or-key',
  OPENAI_API_KEY: 'oai-key',
  DATABASE_URL: 'postgres://localhost/db',
};

const CANDIDATE_CONTENT = {
  title: validCandidateIdeaCrossDomain.title,
  summary: validCandidateIdeaCrossDomain.summary,
  claims: validCandidateIdeaCrossDomain.claims,
  evidenceRefs: validCandidateIdeaCrossDomain.evidenceRefs,
  subtype: validCandidateIdeaCrossDomain.subtype,
  subtypePayload: validCandidateIdeaCrossDomain.subtypePayload,
};

const fakeGateway: GenerationGateway = {
  generate: async () => {
    const response: ModelGatewayResponse = {
      accepted: true,
      validationResult: 'accepted',
      output: CANDIDATE_CONTENT,
      providerMeta: validProviderMeta,
    };
    return { response };
  },
};

// Appending seams — each appends its OWN events through the real store (the loop reads them back as data).
const verify: VerifySeam = async () => {};
const score: ScoreSeam = async (candidates, ctx) => {
  for (const c of candidates) {
    await ctx.append({
      id: `${c.id}-novelty`,
      runId: ctx.runId,
      generationId: ctx.generationId,
      candidateId: c.id,
      type: 'novelty.scored',
      actor: 'selection_controller',
      payload: validNoveltyScore as unknown as Record<string, unknown>,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    await ctx.append({
      id: `${c.id}-fitness`,
      runId: ctx.runId,
      generationId: ctx.generationId,
      candidateId: c.id,
      type: 'fitness.scored',
      actor: 'selection_controller',
      payload: validFitnessScore as unknown as Record<string, unknown>,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
  }
};
const reproduce: ReproduceSeam = async (ctx) => {
  ctx.outcomes.int('mutation_point', 0, 8);
  await ctx.append({
    id: `${ctx.generationId}-reproduced`,
    runId: ctx.runId,
    generationId: ctx.generationId,
    type: 'agenome.reproduced',
    actor: 'agenome',
    payload: { mode: ctx.mode },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
};

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

describe('runGenerationLoop exit — P3.11 run-terminal classification (real PG append path)', () => {
  // spec(§3/§4) + rule #2 — a happy-path run that yields a scored survivor appends EXACTLY ONE run.completed
  // (with finalIdeaRef) via the authoritative path; sequence-ordered; no in-place edit (append-only store).
  test('loop_exit_emits_single_run_terminal', async () => {
    const runId = 'run-terminal-it-1';
    const config = loadConfig({
      env: VALID_ENV,
      fileSources: { caps: { maxGenerations: 1, maxPopulation: 2 } },
    });

    await runGenerationLoop({
      runId,
      config,
      eventStore: store,
      gateway: fakeGateway,
      seams: { verify, score, reproduce },
    });

    const log = await store.readByRun(runId);
    const completedEvents = log.filter((e) => e.type === 'run.completed');
    expect(completedEvents).toHaveLength(1); // exactly one run-terminal event
    expect(log.filter((e) => e.type === 'run.failed')).toHaveLength(0);

    const completed = completedEvents[0]!;
    const finalIdeaRef = (completed.payload as { finalIdeaRef?: unknown }).finalIdeaRef;
    expect(typeof finalIdeaRef).toBe('string');
    // finalIdeaRef points at a real created candidate (the best-so-far survivor).
    const createdIds = new Set(
      log.filter((e) => e.type === 'candidate.created').map((e) => e.candidateId),
    );
    expect(createdIds.has(finalIdeaRef as string)).toBe(true);

    // the terminal is the LAST event (highest sequence) — sequence is the sole ordering key.
    const maxSeq = Math.max(...log.map((e) => e.sequence));
    expect(completed.sequence).toBe(maxSeq);
  });
});
