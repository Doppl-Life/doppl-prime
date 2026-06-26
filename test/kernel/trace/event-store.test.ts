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
} from '../../../src/kernel/trace/event-store.ts';
import type { RunEvent } from '../../../src/kernel/boundary.ts';

test('records in-memory events with contiguous indexes', () => {
  const recorder = createMemoryEventRecorder([], 'run_test');

  const started = recorder.push('run.started', { runId: 'run_test' });
  const completed = recorder.push('run.completed', { runId: 'run_test' });

  assert.equal(started.index, 0);
  assert.equal(started.sequence, 0);
  assert.equal(started.runId, 'run_test');
  assert.equal(started.id, 'evt_run_test_0');
  assert.equal(started.actor, 'runtime');
  assert.equal(started.schemaVersion, 1);
  assert.equal(started.type, 'run.started');
  assert.deepEqual(started.payload, { runId: 'run_test' });
  assert.equal(completed.index, 1);
  assert.equal(completed.sequence, 1);
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
    sequence: 2,
    type: 'run.completed',
    payload: { runId: 'run_test', childId: 'child_1' },
  });

  const rawLog = await readFile(eventLogPath, 'utf8');
  assert.equal(rawLog.trim().split('\n').length, 3);
  const readEvents = await readRunEvents(eventLogPath);
  assert.equal(readEvents.length, 3);
  assert.deepEqual(readEvents.map((event) => event.sequence), [0, 1, 2]);
  assert.deepEqual(readEvents.map((event) => event.runId), ['run_test', 'run_test', 'run_test']);
  assert.equal(readEvents[2]!.candidateId, 'child_1');
});

test('normalizes legacy event logs into canonical envelopes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'doppl-events-legacy-'));
  const eventLogPath = path.join(dir, 'events.jsonl');
  await writeRunEvents(eventLogPath, [
    { index: 0, type: 'run.started', payload: { runId: 'run_legacy', caseId: 'case_a' } },
    { index: 1, type: 'candidate.created', payload: { candidateId: 'cand_a', agenomeId: 'ag_a' } },
  ]);

  const events = await readRunEvents(eventLogPath);

  assert.equal(events[0]!.id, 'evt_run_legacy_0');
  assert.equal(events[0]!.sequence, 0);
  assert.equal(events[0]!.occurredAt, new Date(0).toISOString());
  assert.equal(events[1]!.runId, 'run_legacy');
  assert.equal(events[1]!.actor, 'agenome');
  assert.equal(events[1]!.candidateId, 'cand_a');
  assert.equal(events[1]!.agenomeId, 'ag_a');
});

test('replays events into an inspectable run projection', () => {
  const projection = replayRunProjection([
    { index: 0, type: 'run.started', payload: { runId: 'run_test', caseId: 'case_a' } },
    { index: 1, type: 'knowledge.packet_selected', payload: { packetId: 'packet_1', items: 3 } },
    { index: 3, type: 'candidate.created', payload: { candidateId: 'cand_a', agenomeId: 'a' } },
    { index: 4, type: 'candidate.created', payload: { candidateId: 'cand_b', agenomeId: 'b' } },
    { index: 5, type: 'fitness.scored', payload: { candidateId: 'cand_a', total: 80 } },
    { index: 6, type: 'fitness.scored', payload: { candidateId: 'cand_b', total: 40 } },
    {
      index: 7,
      type: 'candidate.fused',
      payload: { childId: 'child_cand_a_cand_b', inheritanceWeights: { parentA: 0.667, parentB: 0.333 } },
    },
    { index: 8, type: 'model.operation_started', payload: { purpose: 'problem_recovery', provider: 'model_generation_provider', model: 'fixture-model' } },
    { index: 9, type: 'model.operation_started', payload: { purpose: 'candidate_generation', provider: 'model_generation_provider', model: 'fixture-model' } },
    { index: 10, type: 'model.operation_started', payload: { purpose: 'critic_judgment', provider: 'model_generation_provider', model: 'fixture-model' } },
    { index: 11, type: 'model.output_accepted', payload: { callId: 'call_1', purpose: 'problem_recovery', status: 'accepted' } },
    { index: 12, type: 'model.output_repair_requested', payload: { callId: 'call_2', purpose: 'candidate_generation', status: 'repair_requested' } },
    { index: 13, type: 'model.output_repaired', payload: { callId: 'call_3', purpose: 'candidate_generation.repair', status: 'repaired' } },
    { index: 14, type: 'model.output_rejected', payload: { callId: 'call_4', purpose: 'critic_judgment.repair', status: 'rejected' } },
    { index: 15, type: 'run.completed', payload: { runId: 'run_test', childId: 'child_cand_a_cand_b' } },
  ]);

  assert.deepEqual(projection, {
    runId: 'run_test',
    caseId: 'case_a',
    packetId: 'packet_1',
    candidateIds: ['cand_a', 'cand_b'],
    fitnessTotals: { cand_a: 80, cand_b: 40 },
    childId: 'child_cand_a_cand_b',
    completed: true,
    eventCount: 15,
    sequenceThrough: 15,
    lastEventAt: new Date(0).toISOString(),
    modelOutputs: {
      started: 3,
      accepted: 1,
      repairRequested: 1,
      repaired: 1,
      rejected: 1,
      byPurpose: {
        problem_recovery: { started: 1, accepted: 1, repairRequested: 0, repaired: 0, rejected: 0 },
        candidate_generation: { started: 1, accepted: 0, repairRequested: 1, repaired: 0, rejected: 0 },
        critic_judgment: { started: 1, accepted: 0, repairRequested: 0, repaired: 0, rejected: 0 },
        'candidate_generation.repair': { started: 0, accepted: 0, repairRequested: 0, repaired: 1, rejected: 0 },
        'critic_judgment.repair': { started: 0, accepted: 0, repairRequested: 0, repaired: 0, rejected: 1 },
      },
    },
  });
});
