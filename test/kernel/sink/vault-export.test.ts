import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { runKernel } from '../../../src/kernel/engine/run-kernel.ts';
import { exportRunToVault } from '../../../src/kernel/sink/vault-export.ts';
import { readRunEvents, replayRunProjection } from '../../../src/kernel/trace/event-store.ts';
import { readModelCallRecords } from '../../../src/kernel/model/model-gateway.ts';

test('exports problem recovery and child solution markdown separately', async () => {
  const run = await runKernel({
    runId: 'run_export',
    casePath: 'test/fixtures/fsd-seed.json',
    vault: '../agarden',
    fixturePath: 'test/fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
    allowTestFixtureProviders: true,
  });
  const outDir = await mkdtemp(path.join(tmpdir(), 'doppl-vault-'));
  const manifest = await exportRunToVault(run, outDir);
  assert.ok(manifest.files.some((file) => file.endsWith('problem-recovery.md')));
  assert.ok(manifest.files.some((file) => file.endsWith('control-baseline.md')));
  assert.ok(manifest.files.some((file) => file.includes('child_')));
  assert.ok(manifest.files.some((file) => file.endsWith('proposal-nodes/case-study.md')));
  assert.ok(manifest.files.some((file) => file.endsWith('proposal-nodes/problem-recovery.md')));
  assert.ok(manifest.files.some((file) => file.endsWith('proposal-nodes/doppl.md')));
  assert.ok(manifest.files.some((file) => file.endsWith('events.jsonl')));
  const recovery = await readFile(
    manifest.files.find((file) => file.endsWith('problem-recovery.md'))!,
    'utf8',
  );
  assert.match(recovery, /artifact_type: problem_recovery/);
  const eventLogPath = manifest.files.find((file) => file.endsWith('events.jsonl'))!;
  const projection = replayRunProjection(await readRunEvents(eventLogPath));
  assert.equal(projection.runId, 'run_export');
  assert.equal(projection.completed, true);
  assert.equal(projection.childId, run.fusion?.child.id);
});

test('exports a calibrator-facing run index', async () => {
  const run = await runKernel({
    runId: 'run_export_index',
    casePath: 'test/fixtures/fsd-seed.json',
    vault: '../agarden',
    fixturePath: 'test/fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
    allowTestFixtureProviders: true,
  });
  const outDir = await mkdtemp(path.join(tmpdir(), 'doppl-vault-index-'));
  const manifest = await exportRunToVault(run, outDir);
  const indexPath = manifest.files.find((file) => file.endsWith('run-index.json'))!;
  const index = JSON.parse(await readFile(indexPath, 'utf8'));

  assert.equal(index.artifact_type, 'kernel_run_index');
  assert.equal(index.runId, 'run_export_index');
  assert.ok(index.initialAgenomePool.some((agenome: { id: string }) => agenome.id === 'ag_blindside'));
  assert.equal(index.problemRecovery.path, 'problem-recovery.md');
  assert.ok(index.agenomes.length >= 2);
  assert.ok(index.agenomes[0].prompt);
  assert.ok(index.agenomes[0].energy);
  assert.ok(index.energyLedger.some((entry: { kind: string }) => entry.kind === 'allocation'));
  assert.ok(index.energyLedger.some((entry: { kind: string }) => entry.kind === 'spend'));
  assert.equal(index.candidates.length, run.candidates.length);
  assert.equal(index.child.id, run.fusion?.child.id);
  assert.deepEqual(index.child.parentCandidateIds, run.fusion?.parentCandidateIds);
  assert.equal(index.fusionChildren.length, run.fusionChildren.length);
  assert.equal(index.fusionChildren[0].child.id, run.fusionChildren[0]?.child.id);
  assert.deepEqual(index.fusionChildren[0].parentCandidateIds, run.fusionChildren[0]?.parentCandidateIds);
  assert.equal(index.trace.path, 'trace.json');
  assert.equal(index.trace.eventsPath, 'events.jsonl');
  assert.equal(index.proposalNodes.root, 'proposal-nodes/case-study.md');
  assert.equal(index.proposalNodes.problemRecovery, 'proposal-nodes/problem-recovery.md');
  assert.equal(index.proposalNodes.doppl, 'proposal-nodes/doppl.md');
  assert.equal(index.fitnessRecords[0].selection.frontier.pareto, true);
  assert.equal(index.fitnessRecords[0].selection.frontier.rank, 1);
  assert.equal(index.fitnessRecords[0].selection.proposalRating.scale, '-5_to_5');
  assert.equal(index.scheduleComparisons[0].generation, 0);
  assert.deepEqual(
    index.scheduleComparisons[0].modes.map((mode: { schedule: string }) => mode.schedule),
    ['diverge', 'balanced', 'converge'],
  );
  assert.ok(index.scheduleComparisons[0].modes[0].selectedParentIds.length > 0);
  assert.equal(index.controlBaseline.artifact_type, 'control_baseline');
  assert.equal(index.controlBaseline.path, 'control-baseline.md');
  assert.equal(index.controlBaseline.selection, 'clean_agent_baseline_provider');
  assert.equal(index.controlBaseline.candidate.generation, 0);
  assert.equal(index.assayControl.assayType, 'in_run_clean_baseline');
  assert.equal(index.assayControl.controlArtifact.path, 'control-baseline.md');
  assert.equal(index.assayControl.baseline.type, 'clean_baseline');
  assert.equal(index.assayControl.survivor.type, 'doppl_survivor');
  assert.ok(['doppl_wins', 'baseline_wins', 'tie', 'inconclusive'].includes(index.assayControl.verdict));
  assert.match(index.assayControl.statement, /baseline|Assay/i);
  assert.equal(index.assayControl.heldOutJudge.judgeType, 'deterministic_artifact_rubric');
  assert.equal(index.assayControl.heldOutJudge.scoreSource, 'artifact_rubric_not_training_fitness');
  assert.ok(['doppl_wins', 'baseline_wins', 'tie', 'inconclusive'].includes(index.assayControl.heldOutJudge.verdict));
  assert.equal(typeof index.assayControl.heldOutJudge.delta.score, 'number');
  assert.equal(index.assayControl.heldOutJudge.baseline.candidateId, index.assayControl.baseline.candidateId);
  assert.equal(index.assayControl.heldOutJudge.survivor.candidateId, index.assayControl.survivor.candidateId);
  assert.equal(index.assayControl.heldOutJudge.referenceBenchmark.judgeType, 'sealed_reference_keyword_benchmark');
  assert.equal(index.assayControl.heldOutJudge.referenceBenchmark.referenceStatus, 'no_reference_available');
  assert.equal(index.assayControl.heldOutJudge.referenceBenchmark.visibility, 'none');
  assert.equal(index.assayControl.heldOutJudge.referenceBenchmark.contentIncluded, false);
  assert.equal(index.assayControl.heldOutJudge.referenceBenchmark.baseline, null);
  assert.equal(index.assayControl.heldOutJudge.referenceBenchmark.survivor, null);
  assert.equal(index.assayControl.heldOutJudge.referenceBenchmark.delta.score, null);
  assert.equal(index.assayControl.heldOutJudge.referenceBenchmark.verdict, 'inconclusive');
  assert.equal(index.assayControl.referenceCase.status, 'no_reference_available');
  assert.equal(index.assayControl.referenceCase.visibility, 'none');
  assert.equal(index.assayControl.referenceCase.path, null);
  assert.equal(index.assayControl.referenceCase.exposedToGeneration, false);
  assert.doesNotMatch(JSON.stringify(index.assayControl.heldOutJudge.referenceBenchmark), /pure service|owned-fleet hybrid|Tesla/i);
  assert.match(index.assayControl.limits[0], /in-run critic fitness/i);
  const controlPath = manifest.files.find((file) => file.endsWith('control-baseline.md'))!;
  const controlMarkdown = await readFile(controlPath, 'utf8');
  assert.match(controlMarkdown, /artifact_type: control_baseline/);
  assert.match(controlMarkdown, /Clean Control Baseline/);
  assert.equal(index.modelOutputs.accepted, 0);
  assert.deepEqual(index.evolution.map((generation: { generation: number }) => generation.generation), [0]);
  assert.equal(index.budget.usedUnits, 1);
  assert.equal(index.budget.exhausted, false);
});

test('exports model call evidence when present on the run', async () => {
  const run = await runKernel({
    runId: 'run_export_model_calls',
    casePath: 'test/fixtures/fsd-seed.json',
    vault: '../agarden',
    fixturePath: 'test/fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
    allowTestFixtureProviders: true,
  });
  run.modelCallRecords = [
    {
      id: 'call_1',
      runId: run.id,
      purpose: 'problem_recovery',
      provider: 'replay',
      model: 'fixture-model',
      prompt: 'recover',
      outputText: '{"title":"Recovered"}',
      metadata: {},
    },
  ];

  const outDir = await mkdtemp(path.join(tmpdir(), 'doppl-vault-model-'));
  const manifest = await exportRunToVault(run, outDir);
  const modelCallsPath = manifest.files.find((file) => file.endsWith('model-calls.jsonl'))!;

  assert.ok(modelCallsPath);
  assert.equal((await readModelCallRecords(modelCallsPath))[0]?.prompt, 'recover');
});

test('exports a separate clean-agent baseline when the run provides one', async () => {
  const run = await runKernel({
    runId: 'run_export_clean_baseline',
    casePath: 'test/fixtures/fsd-seed.json',
    vault: '../agarden',
    fixturePath: 'test/fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
    allowTestFixtureProviders: true,
    generationProviders: {
      problemRecovery: {
        async recover({ caseStudy }) {
          return {
            id: `clean_export_recovery_${caseStudy.id}`,
            caseId: caseStudy.id,
            title: 'Clean Export Recovery',
            recoveredProblem: 'Recover for clean export.',
            hiddenConstraint: 'The clean baseline is separate from evolution.',
            falsifier: 'The run index points at a generation-0 fallback instead.',
            citedKnowledge: [],
          };
        },
      },
      cleanBaseline: {
        async generate({ caseStudy }) {
          return {
            id: 'clean_export_baseline',
            caseId: caseStudy.id,
            agenomeId: 'ag_clean_control',
            generation: 0,
            title: 'Clean Export Baseline',
            summary: 'Single-pass clean control.',
            mechanism: 'Direct clean-agent answer.',
            claimedDelta: 'Control answer.',
            citedKnowledge: [],
          };
        },
      },
      candidateGenerator: {
        async generate({ caseStudy, generation }) {
          return [
            {
              id: `export_evolved_${generation}_a`,
              caseId: caseStudy.id,
              agenomeId: 'ag_export_a',
              generation,
              title: 'Export Evolved A',
              summary: 'summary',
              mechanism: 'mechanism',
              claimedDelta: 'delta',
              citedKnowledge: [],
            },
            {
              id: `export_evolved_${generation}_b`,
              caseId: caseStudy.id,
              agenomeId: 'ag_export_b',
              generation,
              title: 'Export Evolved B',
              summary: 'summary',
              mechanism: 'mechanism',
              claimedDelta: 'delta',
              citedKnowledge: [],
            },
          ];
        },
      },
      criticCouncil: {
        async judge({ candidates }) {
          return candidates.map((candidate, index) => ({
            candidateId: candidate.id,
            criticId: 'export-control',
            score: candidate.id === 'clean_export_baseline' ? 68 : 88 - index,
            pressure: 'export pressure',
            revisionMandate: 'export honestly',
          }));
        },
      },
    },
  });

  const outDir = await mkdtemp(path.join(tmpdir(), 'doppl-vault-clean-baseline-'));
  const manifest = await exportRunToVault(run, outDir);
  const indexPath = manifest.files.find((file) => file.endsWith('run-index.json'))!;
  const index = JSON.parse(await readFile(indexPath, 'utf8'));

  assert.equal(index.controlBaseline.sourceCandidateId, 'clean_export_baseline');
  assert.equal(index.controlBaseline.selection, 'clean_agent_baseline_provider');
  assert.equal(index.assayControl.baseline.candidateId, 'clean_export_baseline');
  assert.equal(index.assayControl.controlArtifact.selection, 'clean_agent_baseline_provider');
  assert.equal(index.assayControl.heldOutJudge.baseline.candidateId, 'clean_export_baseline');
  assert.equal(index.assayControl.heldOutJudge.baseline.factors.some((factor: string) => /citation/i.test(factor)), true);
  const controlPath = manifest.files.find((file) => file.endsWith('control-baseline.md'))!;
  const controlMarkdown = await readFile(controlPath, 'utf8');
  assert.match(controlMarkdown, /source_candidate_id: clean_export_baseline/);
  assert.match(controlMarkdown, /selection: clean_agent_baseline_provider/);
});
