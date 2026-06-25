import { validRunEventEnvelope } from '@doppl/contracts';
import type { LineageGraphProjection, RunEventEnvelope } from '@doppl/contracts';

/**
 * Web-local fixtures — only for shapes NOT covered by `@doppl/contracts` CANONICAL_FIXTURES (P0.14).
 * The canonical single-node `validLineageGraphProjection` exists upstream; the dashboard needs a
 * MULTI-node/edge graph exercising all five §10 node types (generation/agenome/candidate/critic/
 * score) for the client + later React Flow slices. Reuse the canonical fixtures everywhere else.
 */
export const multiNodeLineage: LineageGraphProjection = {
  runId: 'run_1',
  nodes: [
    { id: 'g0', type: 'generation', label: 'Generation 0', dataRef: 'gen_0', generationIndex: 0 },
    {
      id: 'a0',
      type: 'agenome',
      label: 'Agenome 0',
      status: 'active',
      dataRef: 'agn_0',
      generationIndex: 0,
    },
    {
      id: 'c0',
      type: 'candidate',
      label: 'Candidate 0',
      status: 'scored',
      metrics: { fitness: 0.8, novelty: 0.7 },
      dataRef: 'cand_0',
      generationIndex: 0,
    },
    { id: 'cr0', type: 'critic', label: 'Critic review', status: 'passed', dataRef: 'crev_0' },
    { id: 's0', type: 'score', label: 'Fitness 0.80', metrics: { total: 0.8 }, dataRef: 'fit_0' },
  ],
  edges: [
    { id: 'e0', source: 'g0', target: 'a0', type: 'spawned' },
    { id: 'e1', source: 'a0', target: 'c0', type: 'generated' },
    { id: 'e2', source: 'c0', target: 'cr0', type: 'reviewed_by' },
    { id: 'e3', source: 'c0', target: 's0', type: 'scored' },
  ],
  sequenceThrough: 12,
};

/** A payload that is NOT a valid LineageGraphProjection (nodes is a string, sequenceThrough missing). */
export const malformedLineage: unknown = { runId: 'run_1', nodes: 'not-an-array', edges: [] };

/**
 * Build a RunEventEnvelope with an explicit `sequence` + `occurredAt`, defaulting the rest from the
 * canonical envelope fixture. Lets a test invert occurredAt vs sequence to prove ordering is by
 * `sequence` ALONE (§11 / safety rule #2), never by wall-clock occurredAt.
 */
export function makeEnvelope(
  sequence: number,
  occurredAt: string,
  overrides: Partial<RunEventEnvelope> = {},
): RunEventEnvelope {
  return {
    ...validRunEventEnvelope,
    id: `evt_${sequence}`,
    sequence,
    occurredAt,
    ...overrides,
  };
}
