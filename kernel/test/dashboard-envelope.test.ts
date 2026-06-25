import test from 'node:test';
import assert from 'node:assert/strict';
import { toDashboardEnvelope } from '../src/dashboard-envelope.ts';
import { createMemoryEventRecorder } from '../src/event-store.ts';

test('reshapes a normalized event into the dashboard envelope with all required fields', () => {
  const recorder = createMemoryEventRecorder([], 'run_demo');
  const event = recorder.push('candidate.created', {
    candidateId: 'cand_a',
    agenomeId: 'ag_a',
    generation: 0,
  });

  const envelope = toDashboardEnvelope(event);

  // Every field the client RunEventEnvelope schema marks required must be present.
  for (const key of ['id', 'sequence', 'type', 'actor', 'occurredAt', 'runId', 'payload', 'schemaVersion'] as const) {
    assert.ok(envelope[key] !== undefined, `missing required envelope field: ${key}`);
  }
  assert.equal(envelope.type, 'candidate.created');
  assert.equal(envelope.runId, 'run_demo');
  assert.equal(envelope.candidateId, 'cand_a');
  assert.equal(envelope.agenomeId, 'ag_a');
  assert.deepEqual(envelope.payload, { candidateId: 'cand_a', agenomeId: 'ag_a', generation: 0 });
});

test('omits correlation ids that are absent (matches the schema optional fields)', () => {
  const recorder = createMemoryEventRecorder([], 'run_demo');
  const event = recorder.push('run.started', { runId: 'run_demo', caseId: 'case_a' });

  const envelope = toDashboardEnvelope(event);

  assert.equal('candidateId' in envelope, false);
  assert.equal('agenomeId' in envelope, false);
  assert.equal(envelope.schemaVersion, 1);
});

test('reshapes lifecycle payloads into the dashboard per-type contracts', () => {
  const recorder = createMemoryEventRecorder([], 'run_demo');
  const started = recorder.push('run.started', { runId: 'run_demo', caseId: 'case_a' });
  const genStarted = recorder.push('generation.started', { generation: 2 });
  const failed = recorder.push('run.failed', { runId: 'run_demo', error: 'boom' });

  // run.started → { startedAt }, not dalton's { runId, caseId }.
  assert.deepEqual(toDashboardEnvelope(started).payload, { startedAt: started.occurredAt });
  // generation.started → { index }.
  assert.deepEqual(toDashboardEnvelope(genStarted).payload, { index: 2 });
  // run.failed → { completedAt, reason }.
  assert.deepEqual(toDashboardEnvelope(failed).payload, {
    completedAt: failed.occurredAt,
    reason: 'boom',
  });
});

test('passes through payloads for events still awaiting the aggregate projection', () => {
  const recorder = createMemoryEventRecorder([], 'run_demo');
  const event = recorder.push('candidate.created', { candidateId: 'cand_a', agenomeId: 'ag_a', generation: 0 });

  // candidate.created needs the rich CandidateIdea from the run aggregate; until then the
  // flat payload passes through unchanged (and keeps the legacy dashboard working).
  assert.deepEqual(toDashboardEnvelope(event).payload, {
    candidateId: 'cand_a',
    agenomeId: 'ag_a',
    generation: 0,
  });
});
