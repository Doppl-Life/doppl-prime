import { describe, expect, test } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import type { RunEventType } from '@doppl/contracts';
import type { RunEventRow } from '../../../../src/event-store';
import { reigningChampion } from '../../../../src/runtime/loop/championLedger';

/**
 * reigningChampion (Wave 1, Step 1 — lock the peak candidate) — the cross-generation PEAK scored candidate
 * "so far", PURE over the persisted log (rule #7 — read the recorded fitness, never recompute; replay-
 * stable). It composes the §3 scored-survivor projection (`scoredSurvivors` — scored ∧ ¬culled) so a culled
 * lineage can never reign, and resolves the champion's agenome + home generation from its `candidate.created`
 * so the loop can carry the champion (its locked score) forward as a non-regenerating floor.
 */

let autoSeq = 0;
function row(over: Partial<RunEventRow> & { type: RunEventType }): RunEventRow {
  const sequence = over.sequence ?? autoSeq++;
  return {
    id: over.id ?? `e-${sequence}`,
    runId: over.runId ?? 'run_1',
    generationId: over.generationId ?? 'run_1-gen0',
    agenomeId: over.agenomeId ?? null,
    candidateId: over.candidateId ?? null,
    type: over.type,
    sequence,
    occurredAt: over.occurredAt ?? new Date(0),
    actor: over.actor ?? 'selection_controller',
    correlationId: null,
    langfuseTraceId: null,
    langfuseObservationId: null,
    payload: over.payload ?? {},
    schemaVersion: over.schemaVersion ?? CURRENT_SCHEMA_VERSION,
  } as RunEventRow;
}

const created = (candidateId: string, agenomeId: string, generationId: string): RunEventRow =>
  row({
    type: 'candidate.created',
    generationId,
    candidateId,
    agenomeId,
    payload: { id: candidateId },
  });
const scored = (
  candidateId: string,
  total: number,
  generationId: string,
  sequence?: number,
): RunEventRow =>
  row({
    type: 'fitness.scored',
    generationId,
    candidateId,
    payload: { candidateId, total },
    ...(sequence !== undefined ? { sequence } : {}),
  });
const culled = (agenomeIds: string[]): RunEventRow =>
  row({
    type: 'lineage.culled',
    payload: { targetIds: agenomeIds, reason: 'truncation', scoreSnapshot: {} },
  });

describe('reigningChampion — the cross-generation peak scored candidate (replay-stable)', () => {
  test('null when nothing has scored yet', () => {
    expect(reigningChampion([created('c1', 'ag1', 'run_1-gen0')])).toBeNull();
  });

  test('returns the lone scored champion with its agenome + home generation', () => {
    const log = [created('c1', 'ag1', 'run_1-gen0'), scored('c1', 0.6, 'run_1-gen0')];
    expect(reigningChampion(log)).toMatchObject({
      candidateId: 'c1',
      agenomeId: 'ag1',
      total: 0.6,
      generationId: 'run_1-gen0',
    });
  });

  test('the highest-total survivor reigns ACROSS generations (a gen-0 peak survives a weaker gen-1)', () => {
    const log = [
      created('c0', 'ag0', 'run_1-gen0'),
      scored('c0', 0.7, 'run_1-gen0'),
      created('c1', 'ag1', 'run_1-gen1'),
      scored('c1', 0.6, 'run_1-gen1'),
    ];
    expect(reigningChampion(log)?.candidateId).toBe('c0'); // gen-0 peak still reigns
  });

  test('a later generation that BEATS the champion takes the crown', () => {
    const log = [
      created('c0', 'ag0', 'run_1-gen0'),
      scored('c0', 0.6, 'run_1-gen0'),
      created('c1', 'ag1', 'run_1-gen1'),
      scored('c1', 0.75, 'run_1-gen1'),
    ];
    expect(reigningChampion(log)?.candidateId).toBe('c1');
  });

  test('ties break to the LOWEST sequence (deterministic → replay-stable)', () => {
    const log = [
      created('c0', 'ag0', 'run_1-gen0'),
      created('c1', 'ag1', 'run_1-gen0'),
      scored('c0', 0.6, 'run_1-gen0', 100),
      scored('c1', 0.6, 'run_1-gen0', 200),
    ];
    expect(reigningChampion(log)?.candidateId).toBe('c0');
  });

  test('a CULLED lineage can never reign (the higher-scored but culled candidate is excluded)', () => {
    const log = [
      created('c0', 'ag0', 'run_1-gen0'),
      scored('c0', 0.9, 'run_1-gen0'), // best total…
      created('c1', 'ag1', 'run_1-gen0'),
      scored('c1', 0.6, 'run_1-gen0'),
      culled(['ag0']), // …but ag0 is culled → cannot reign
    ];
    expect(reigningChampion(log)?.candidateId).toBe('c1');
  });

  test('a scored champion with no creation event fails closed (null, never fabricates an agenome)', () => {
    const log = [scored('orphan', 0.8, 'run_1-gen0')]; // scored but never created
    expect(reigningChampion(log)).toBeNull();
  });
});
