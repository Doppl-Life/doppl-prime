import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { exportRunToVault } from '../../../src/kernel/sink/vault-export.ts';
import { readRunEvents, replayRunProjection } from '../../../src/kernel/trace/event-store.ts';
import { readModelCallRecords } from '../../../src/kernel/model/model-gateway.ts';
import { loadCapturedRun } from '../captured-run.ts';

test('exports problem recovery and child solution markdown separately', async () => {
  const run = loadCapturedRun();
  const outDir = await mkdtemp(path.join(tmpdir(), 'doppl-vault-'));
  const manifest = await exportRunToVault(run, outDir);
  assert.ok(manifest.files.some((file) => file.endsWith('problem-recovery.md')));
  assert.ok(manifest.files.some((file) => file.endsWith('control-baseline.md')));
  assert.ok(manifest.files.some((file) => file.includes('child_')));
  assert.ok(manifest.files.some((file) => file.endsWith('proposal-nodes/case-study.md')));
  assert.ok(manifest.files.some((file) => file.endsWith('proposal-nodes/doppl.md')));
  assert.ok(manifest.files.some((file) => file.endsWith('events.jsonl')));
  const recovery = await readFile(
    manifest.files.find((file) => file.endsWith('problem-recovery.md'))!,
    'utf8',
  );
  assert.match(recovery, /artifact_type: problem_recovery/);
  const eventLogPath = manifest.files.find((file) => file.endsWith('events.jsonl'))!;
  const projection = replayRunProjection(await readRunEvents(eventLogPath));
  assert.equal(projection.runId, run.id);
  assert.equal(projection.completed, true);
  assert.equal(projection.childId, run.fusion?.child.id);
});

test('exports a calibrator-facing run index', async () => {
  const run = loadCapturedRun();
  const outDir = await mkdtemp(path.join(tmpdir(), 'doppl-vault-index-'));
  const manifest = await exportRunToVault(run, outDir);
  const indexPath = manifest.files.find((file) => file.endsWith('run-index.json'))!;
  const index = JSON.parse(await readFile(indexPath, 'utf8'));

  assert.equal(index.artifact_type, 'kernel_run_index');
  assert.equal(index.runId, run.id);
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
  assert.ok(index.modelOutputs.accepted > 0, 'real run records accepted model outputs');
  assert.deepEqual(index.evolution.map((generation: { generation: number }) => generation.generation), [0]);
  assert.equal(index.budget.usedUnits, 1);
  assert.equal(index.budget.exhausted, false);
});

test('exports the real model call evidence recorded on the run', async () => {
  const run = loadCapturedRun();
  assert.ok(run.modelCallRecords.length > 0, 'captured run carries real model calls');

  const outDir = await mkdtemp(path.join(tmpdir(), 'doppl-vault-model-'));
  const manifest = await exportRunToVault(run, outDir);
  const modelCallsPath = manifest.files.find((file) => file.endsWith('model-calls.jsonl'))!;

  assert.ok(modelCallsPath);
  const exported = await readModelCallRecords(modelCallsPath);
  assert.equal(exported.length, run.modelCallRecords.length);
  assert.equal(exported[0]?.prompt, run.modelCallRecords[0]?.prompt);
});

test('exports the separate clean-agent baseline the live run produced', async () => {
  const run = loadCapturedRun();
  const baselineId = run.controlBaseline!.id;

  const outDir = await mkdtemp(path.join(tmpdir(), 'doppl-vault-clean-baseline-'));
  const manifest = await exportRunToVault(run, outDir);
  const indexPath = manifest.files.find((file) => file.endsWith('run-index.json'))!;
  const index = JSON.parse(await readFile(indexPath, 'utf8'));

  assert.equal(index.controlBaseline.sourceCandidateId, baselineId);
  assert.equal(index.controlBaseline.selection, 'clean_agent_baseline_provider');
  assert.equal(index.assayControl.baseline.candidateId, baselineId);
  assert.equal(index.assayControl.controlArtifact.selection, 'clean_agent_baseline_provider');
  assert.equal(index.assayControl.heldOutJudge.baseline.candidateId, baselineId);
  assert.equal(index.assayControl.heldOutJudge.baseline.factors.some((factor: string) => /citation/i.test(factor)), true);
  const controlPath = manifest.files.find((file) => file.endsWith('control-baseline.md'))!;
  const controlMarkdown = await readFile(controlPath, 'utf8');
  assert.match(controlMarkdown, new RegExp(`source_candidate_id: ${baselineId}`));
  assert.match(controlMarkdown, /selection: clean_agent_baseline_provider/);
});
