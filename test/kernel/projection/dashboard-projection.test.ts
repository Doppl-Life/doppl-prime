import test from 'node:test';
import assert from 'node:assert/strict';
import { projectRunIndexToDashboardEvents } from '../../../src/kernel/projection/dashboard-projection.ts';
import { createMemoryEventRecorder } from '../../../src/kernel/trace/event-store.ts';

test('projects a completed run index into dashboard events', () => {
  const recorder = createMemoryEventRecorder([], 'run_projection');
  const started = recorder.push('run.started', { runId: 'run_projection', caseId: 'case_a' });
  recorder.push('run.completed', { runId: 'run_projection', childId: 'cand_child' });

  const events = projectRunIndexToDashboardEvents(
    {
      runId: 'run_projection',
      caseId: 'case_a',
      caseTitle: 'Case A',
      problemRecovery: {
        title: 'Recovered Problem',
        recoveredProblem: 'Explain the real problem.',
      },
      candidates: [
        {
          id: 'cand_a',
          agenomeId: 'ag_a',
          generation: 0,
          title: 'Candidate A',
          summary: 'Summary A',
          mechanism: 'Mechanism A',
          claimedDelta: 'Delta A',
          citedKnowledge: ['K1'],
          mutagen: 'polymath',
          mutagenLineage: ['polymath'],
        },
      ],
      child: null,
      agenomes: [
        {
          id: 'ag_a',
          label: 'Agenome A',
          prompt: 'Prompt A',
          valueWeights: { novelty: 0.5 },
          toolPermissions: [],
          decompositionPolicy: 'one-pass',
          spawnBudget: { maxCandidates: 2 },
          parentAgenomeIds: [],
          mutations: ['polymath'],
          generations: [0],
        },
      ],
      fitnessRecords: [
        {
          candidateId: 'cand_a',
          total: 88,
          components: { novelty: 80, grounding: 90 },
          rationale: 'Strong candidate.',
        },
      ],
      criticVerdicts: [
        {
          candidateId: 'cand_a',
          criticId: 'grounding',
          score: 91,
          pressure: 'Grounded.',
          revisionMandate: 'Name proof.',
        },
      ],
      energyLedger: [
        {
          id: 'energy_a',
          agenomeId: 'ag_a',
          generation: 0,
          kind: 'spend',
          units: 1,
          reason: 'spawn candidate',
          candidateId: 'cand_a',
        },
      ],
      evolution: [{ generation: 0, candidateIds: ['cand_a'] }],
      budget: { maxUnits: 3, usedUnits: 1 },
    },
    recorder.events,
  );

  assert.equal(events[0]?.type, 'run.configured');
  assert.equal(events[1]?.type, 'run.started');
  assert.deepEqual(events.map((event) => event.sequence), events.map((_, index) => index));
  assert.equal(events[1]?.payload && (events[1].payload as { startedAt?: string }).startedAt, started.occurredAt);

  const candidateEvent = events.find((event) => event.type === 'candidate.created');
  assert.ok(candidateEvent);
  const candidate = (candidateEvent.payload as { candidate: { id: string; subtype: string } }).candidate;
  assert.equal(candidate.id, 'cand_a');
  assert.equal(candidate.subtype, 'cross_domain_transfer');

  const fitnessEvent = events.find((event) => event.type === 'fitness.scored');
  assert.equal(
    (fitnessEvent?.payload as { fitness?: { candidateId?: string; total?: number } }).fitness?.candidateId,
    'cand_a',
  );
  assert.equal((fitnessEvent?.payload as { fitness?: { total?: number } }).fitness?.total, 88);
});
