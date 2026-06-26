import { describe, it, expect } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import type { Agenome } from '@doppl/contracts';
import type { RunEventRow } from '../../../src/event-store';
import { createKnowledgeRetriever, directionForBias } from '../../../src/boot/knowledgeRetriever';

/**
 * Boot KB retriever (slice ④) — composes the projections note-fold + the pure selection retriever into the
 * loop's injected `retrieveKnowledge` seam. Reads the run's accumulated research notes via `readByRun`
 * (lexical MVP — no embedding call, so the recorded demo retrieves keyless), scores them vs the agenome's
 * persona, and maps the FB.4 dial to the near/far direction. The seam runs LIVE only; replay re-folds the
 * persisted `candidate.generation_started` (rule #7), so this never runs against a provider on replay.
 */

let seq = 0;
const toolFinished = (
  agenomeId: string,
  result: string,
  generationId = 'run_1-gen0',
): RunEventRow =>
  ({
    id: `e-${seq}`,
    runId: 'run_1',
    generationId,
    agenomeId,
    candidateId: null,
    type: 'tool_call.finished',
    sequence: seq++,
    occurredAt: new Date(0),
    actor: 'runtime',
    correlationId: null,
    langfuseTraceId: null,
    langfuseObservationId: null,
    payload: { toolName: 'web_search', result },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  }) as RunEventRow;

const agenomeWithPersona = (systemPrompt: string): Agenome =>
  ({
    id: 'ag_query',
    runId: 'run_1',
    generationId: 'run_1-gen1',
    parentIds: [],
    systemPrompt,
    personaWeights: {},
    toolPermissions: [],
    decompositionPolicy: 'none',
    spawnBudget: 1,
    status: 'seeded',
  }) as Agenome;

const readByRunOf = (rows: RunEventRow[]) => async () => rows;

describe('directionForBias — the FB.4 dial → near/far retrieval direction', () => {
  it('diverge (bias > neutral) → far (anti-retrieve, avoid trodden ground)', () => {
    expect(directionForBias(0.5)).toBe('far');
    expect(directionForBias(1)).toBe('far');
  });
  it('converge / neutral / absent → near (follow the pheromone trail)', () => {
    expect(directionForBias(-0.5)).toBe('near');
    expect(directionForBias(0)).toBe('near');
    expect(directionForBias(0.1)).toBe('near'); // inside the neutral dead-band → near
    expect(directionForBias(undefined)).toBe('near');
  });
});

describe('createKnowledgeRetriever — folds notes + lexically retrieves vs the persona', () => {
  it('returns the top-k notes nearest the agenome persona (lexical, method=lexical_jaccard)', async () => {
    seq = 0;
    const rows = [
      toolFinished('ag_a', 'solid state battery charge time breakthrough'),
      toolFinished('ag_b', 'grocery food waste cold chain logistics'),
    ];
    const retrieve = createKnowledgeRetriever({ readByRun: readByRunOf(rows), k: 1 });
    const result = await retrieve({
      runId: 'run_1',
      generationId: 'run_1-gen1',
      agenome: agenomeWithPersona('battery charge time'),
    });
    expect(result).toBeDefined();
    expect(result!.method).toBe('lexical_jaccard');
    expect(result!.direction).toBe('near');
    expect(result!.noteIds).toHaveLength(1);
    expect(result!.snippets[0]).toContain('solid state battery'); // the battery note, not the grocery one
    // the persisted id set is the projection's deterministic note id
    expect(result!.noteIds[0]).toMatch(/^research-note:run_1:\d+$/);
  });

  it('maps a diverge dial to far (anti-retrieves the most dissimilar note)', async () => {
    seq = 0;
    const rows = [
      toolFinished('ag_a', 'solid state battery charge time breakthrough'),
      toolFinished('ag_b', 'grocery food waste cold chain logistics'),
    ];
    const retrieve = createKnowledgeRetriever({
      readByRun: readByRunOf(rows),
      generationBias: 0.8,
      k: 1,
    });
    const result = await retrieve({
      runId: 'run_1',
      generationId: 'run_1-gen1',
      agenome: agenomeWithPersona('battery charge time'),
    });
    expect(result!.direction).toBe('far');
    expect(result!.snippets[0]).toContain('grocery'); // the dissimilar note
  });

  it('returns undefined when the run has no notes yet (gen-0 baseline → no retrieval)', async () => {
    const retrieve = createKnowledgeRetriever({ readByRun: readByRunOf([]) });
    const result = await retrieve({
      runId: 'run_1',
      generationId: 'run_1-gen0',
      agenome: agenomeWithPersona('anything'),
    });
    expect(result).toBeUndefined();
  });
});
