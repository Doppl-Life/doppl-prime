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
import type {
  GenerationGateway,
  ReproduceSeam,
  ScoreSeam,
  VerifySeam,
} from '../../../src/runtime/loop/generationLoop';
import { runWorker } from '../../../src/runtime/worker/runWorker';
import { createKnowledgeRetriever } from '../../../src/boot/knowledgeRetriever';
import { buildResearchNotes } from '../../../src/projections/research-notes';

/**
 * In-run retrieval — INTEGRATION (testcontainers, real PG). Proves the shared-knowledge stigmergy loop END
 * TO END against the real append path: gen-0 agents RESEARCH (tool calls → persisted ResearchNotes), gen-1
 * agents RETRIEVE those notes via the real `createKnowledgeRetriever` (reading the authoritative log through
 * `readByRun`), the loop PERSISTS each retrieval on `candidate.generation_started` (rule #7), and the
 * ResearchNote projection folds them into `retrieved` edges. Rule #7 is pinned by RE-FOLDING the persisted
 * log (no retriever, no provider) and getting the identical retrieved-edge set — replay reads the persisted
 * note-id set, never re-queries.
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

// A gateway that SURFACES one tool call per generate — so each agenome leaves a research note (the KB the
// next generation retrieves). The query/result are realistic so the lexical retrieval has signal.
const toolUsingGateway: GenerationGateway = {
  generate: async () => {
    const response: ModelGatewayResponse = {
      accepted: true,
      validationResult: 'accepted',
      output: CANDIDATE_CONTENT,
      providerMeta: validProviderMeta,
    };
    return {
      response,
      toolCalls: [
        {
          toolName: 'web_search',
          query: '{"query":"emergency department patient flow throughput"}',
          result:
            'Hospitals cut ED wait by fast-track triage and Little’s Law capacity balancing across the patient flow.',
          ok: true,
        },
      ],
    };
  },
};

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

describe('in-run retrieval — multi-generation stigmergy flow (real PG append path)', () => {
  test('gen-1 retrieves gen-0 notes → persisted candidate.generation_started → projection retrieved edges → replay-stable', async () => {
    const runId = 'run-inrun-retrieval-it';
    await store.append({
      id: `${runId}-configured`,
      runId,
      type: 'run.configured',
      actor: 'operator',
      payload: {},
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });

    const result = await runWorker({
      runId,
      config: loadConfig({
        env: VALID_ENV,
        fileSources: {
          caps: { maxGenerations: 2, maxPopulation: 2, maxToolCalls: 20, energyBudget: 1_000_000 },
        },
      }),
      eventStore: store,
      gateway: toolUsingGateway,
      seams: { verify, score, reproduce },
      // the real shared-KB retriever, reading the authoritative log (no embedding → lexical, keyless)
      retrieveKnowledge: createKnowledgeRetriever({ readByRun: store.readByRun }),
      listRunIds: async () => [runId],
    });
    expect(result.started).toBe(true);

    const log = await store.readByRun(runId);

    // 1. gen-0 research produced notes; the run reached ≥2 generations (so retrieval had prior notes).
    expect(log.filter((e) => e.type === 'tool_call.finished').length).toBeGreaterThan(0);
    expect(log.filter((e) => e.type === 'generation.started').length).toBeGreaterThanOrEqual(2);

    // 2. retrieval FIRED — ≥1 candidate.generation_started carries a non-empty retrieved-note-id set (rule #7
    //    persistence: the set is in the log, not recomputed).
    const markers = log.filter((e) => e.type === 'candidate.generation_started');
    expect(markers.length).toBeGreaterThan(0);
    const persistedRetrievedIds = new Set<string>();
    for (const m of markers) {
      const ids = (m.payload as { retrievedNoteIds?: unknown }).retrievedNoteIds;
      expect(Array.isArray(ids)).toBe(true);
      for (const id of ids as string[]) persistedRetrievedIds.add(id);
      expect((m.payload as { retrievalMethod?: unknown }).retrievalMethod).toBe('lexical_jaccard');
    }
    expect(persistedRetrievedIds.size).toBeGreaterThan(0);

    // 3. the projection folds the markers into `retrieved` edges, each targeting a REAL note (no dangling).
    const { state } = buildResearchNotes(log);
    const retrievedEdges = Object.values(state.edges).filter((e) => e.type === 'retrieved');
    expect(retrievedEdges.length).toBeGreaterThan(0);
    for (const edge of retrievedEdges) {
      expect(state.notes[edge.target]).toBeDefined(); // the retrieved note exists in the KB
      expect(persistedRetrievedIds.has(edge.target)).toBe(true); // edge derives from a persisted marker
    }

    // 4. rule #7 — REPLAY is a pure re-fold of the persisted log (no retriever, no provider): re-building the
    //    projection yields the identical retrieved-edge set. The retrieved edges come from the persisted
    //    `candidate.generation_started`, never a re-query.
    const replay = buildResearchNotes(log).state;
    const replayRetrieved = Object.values(replay.edges)
      .filter((e) => e.type === 'retrieved')
      .map((e) => e.id)
      .sort();
    expect(replayRetrieved).toEqual(retrievedEdges.map((e) => e.id).sort());
  });
});
