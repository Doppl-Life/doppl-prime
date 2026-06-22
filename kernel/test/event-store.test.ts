import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  appendRunEvent,
  createMemoryEventRecorder,
  readRunEvents,
  replayRunProjection,
  writeRunEvents,
} from '../src/event-store.ts';
import type { RunEvent } from '../src/contracts.ts';

test('records in-memory events with contiguous indexes', () => {
  const recorder = createMemoryEventRecorder();

  const started = recorder.push('run.started', { runId: 'run_test' });
  const completed = recorder.push('run.completed', { runId: 'run_test' });

  assert.deepEqual(started, {
    index: 0,
    type: 'run.started',
    payload: { runId: 'run_test' },
  });
  assert.equal(completed.index, 1);
  assert.deepEqual(
    recorder.events.map((event) => event.type),
    ['run.started', 'run.completed'],
  );
});

test('writes and reads run events as newline-delimited JSON', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'doppl-events-'));
  const eventLogPath = path.join(dir, 'events.jsonl');
  const events: RunEvent[] = [
    { index: 0, type: 'run.started', payload: { runId: 'run_test' } },
    { index: 1, type: 'knowledge.packet_selected', payload: { packetId: 'packet_1', items: 2 } },
  ];

  await writeRunEvents(eventLogPath, events);
  await appendRunEvent(eventLogPath, {
    index: 2,
    type: 'run.completed',
    payload: { runId: 'run_test', childId: 'child_1' },
  });

  const rawLog = await readFile(eventLogPath, 'utf8');
  assert.equal(rawLog.trim().split('\n').length, 3);
  assert.deepEqual(await readRunEvents(eventLogPath), [
    ...events,
    { index: 2, type: 'run.completed', payload: { runId: 'run_test', childId: 'child_1' } },
  ]);
});

test('replays events into an inspectable run projection', () => {
  const projection = replayRunProjection([
    { index: 0, type: 'run.started', payload: { runId: 'run_test', caseId: 'case_a' } },
    { index: 1, type: 'knowledge.packet_selected', payload: { packetId: 'packet_1', items: 3 } },
    { index: 2, type: 'problem_recovery.created', payload: { recoveryId: 'recovery_case_a' } },
    { index: 3, type: 'candidate.created', payload: { candidateId: 'cand_a', agenomeId: 'a' } },
    { index: 4, type: 'candidate.created', payload: { candidateId: 'cand_b', agenomeId: 'b' } },
    { index: 5, type: 'fitness.scored', payload: { candidateId: 'cand_a', total: 80 } },
    { index: 6, type: 'fitness.scored', payload: { candidateId: 'cand_b', total: 40 } },
    {
      index: 7,
      type: 'candidate.fused',
      payload: { childId: 'child_cand_a_cand_b', inheritanceWeights: { parentA: 0.667, parentB: 0.333 } },
    },
    { index: 8, type: 'run.completed', payload: { runId: 'run_test', childId: 'child_cand_a_cand_b' } },
  ]);

  assert.deepEqual(projection, {
    runId: 'run_test',
    caseId: 'case_a',
    packetId: 'packet_1',
    recoveryId: 'recovery_case_a',
    candidateIds: ['cand_a', 'cand_b'],
    fitnessTotals: { cand_a: 80, cand_b: 40 },
    childId: 'child_cand_a_cand_b',
    completed: true,
    eventCount: 9,
  });
});
