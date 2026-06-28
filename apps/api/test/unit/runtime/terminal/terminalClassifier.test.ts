import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { RunEventType, RunStatus } from '@doppl/contracts';
import { CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import type { RunEventRow } from '../../../../src/event-store';
import { canTransitionRun } from '../../../../src/runtime/state/runStateMachine';
import type { KillPlanSummary } from '../../../../src/runtime/caps/killSwitch';
import {
  classifyRunTerminal,
  runTerminalPath,
} from '../../../../src/runtime/terminal/terminalClassifier';
import { buildPartialTerminalSummary } from '../../../../src/runtime/terminal/partialSummary';

/**
 * P3.11 run-terminal classification (ARCHITECTURE.md §3 terminal-classification rule + §5 kill/crash +
 * energy-exhaustion "score already-verified", §4 terminal events / sequence-ordering, KEY SAFETY RULES
 * #2/#7). `classifyRunTerminal` is a PURE, replay-stable decision over the persisted log: completed iff any
 * scored survivor (fitness.scored ∧ ¬lineage.culled), failed iff none, stopped/cancelled from the P3.10e
 * KillPlanSummary, failed{crash} for P3.13. `energy_exhausted` is mid-flight (NOT a run-terminal) — after it
 * the classifier still emits the REAL terminal (completed if a survivor was verified, else failed).
 */

// A RunEventRow fixture (the inferred select row) with sane nullable defaults — tests set only what matters.
let autoSeq = 0;
function row(over: Partial<RunEventRow> & { type: RunEventType }): RunEventRow {
  const sequence = over.sequence ?? autoSeq++;
  return {
    id: over.id ?? `e-${sequence}`,
    runId: over.runId ?? 'run_t',
    generationId: over.generationId ?? null,
    agenomeId: over.agenomeId ?? null,
    candidateId: over.candidateId ?? null,
    type: over.type,
    sequence,
    occurredAt: over.occurredAt ?? new Date(0),
    actor: over.actor ?? 'runtime',
    correlationId: over.correlationId ?? null,
    langfuseTraceId: over.langfuseTraceId ?? null,
    langfuseObservationId: over.langfuseObservationId ?? null,
    payload: over.payload ?? {},
    schemaVersion: over.schemaVersion ?? CURRENT_SCHEMA_VERSION,
  } as RunEventRow;
}

function fitnessScored(candidateId: string, total: number, sequence?: number): RunEventRow {
  return row({
    type: 'fitness.scored',
    generationId: 'run_t-gen0',
    candidateId,
    payload: { id: `fit-${candidateId}`, candidateId, total },
    ...(sequence !== undefined ? { sequence } : {}),
  });
}
// A scored survivor carrying a judge-acceptance component (Islands pivot A2 — the crowning floor reads it).
function fitnessScoredAcc(
  candidateId: string,
  total: number,
  judgeAcceptance: number,
  sequence?: number,
): RunEventRow {
  return row({
    type: 'fitness.scored',
    generationId: 'run_t-gen0',
    candidateId,
    payload: {
      id: `fit-${candidateId}`,
      candidateId,
      total,
      components: { judge_acceptance: judgeAcceptance },
    },
    ...(sequence !== undefined ? { sequence } : {}),
  });
}
function culled(candidateId: string, sequence?: number): RunEventRow {
  return row({
    type: 'lineage.culled',
    generationId: 'run_t-gen0',
    candidateId,
    payload: { targetIds: [candidateId], reason: 'low_score', scoreSnapshot: {} },
    ...(sequence !== undefined ? { sequence } : {}),
  });
}
const genStarted = (): RunEventRow =>
  row({ type: 'generation.started', generationId: 'run_t-gen0', payload: { index: 0 } });
const candidateCreated = (candidateId: string): RunEventRow =>
  row({ type: 'candidate.created', generationId: 'run_t-gen0', candidateId, payload: {} });
const candidateCreatedFor = (candidateId: string, agenomeId: string): RunEventRow =>
  row({
    type: 'candidate.created',
    generationId: 'run_t-gen0',
    candidateId,
    agenomeId,
    payload: {},
  });
// The REAL cull shape `cull` emits: AGENOME ids in payload.targetIds, NO envelope candidateId.
const culledAgenomes = (agenomeIds: string[]): RunEventRow =>
  row({
    type: 'lineage.culled',
    generationId: 'run_t-gen0',
    payload: { targetIds: agenomeIds, reason: 'truncation', scoreSnapshot: {} },
  });
const energyExhausted = (): RunEventRow =>
  row({ type: 'energy_exhausted', payload: { dimension: 'energyBudget' } });

const operatorStopRunning: KillPlanSummary = {
  reason: 'operator_stop',
  runFrom: 'running',
  runTo: 'stopping',
  generationsTerminated: 1,
};
const operatorStopConfigured: KillPlanSummary = {
  reason: 'operator_stop',
  runFrom: 'configured',
  runTo: 'cancelled',
  generationsTerminated: 0,
};
const energyExhaustionKill: KillPlanSummary = {
  reason: 'cap_breach:energyBudget',
  runFrom: 'running',
  runTo: 'failed',
  generationsTerminated: 0,
};

describe('classifyRunTerminal (P3.11 — pure run-terminal verdict over the persisted log)', () => {
  // spec(§3) — completed iff any scored survivor; finalIdeaRef recorded for run.completed.
  test('completed_when_scored_survivor_exists', () => {
    const log = [genStarted(), candidateCreated('c1'), fitnessScored('c1', 0.8)];
    const verdict = classifyRunTerminal({ log });
    expect(verdict.status).toBe('completed');
    expect(verdict.terminalEvent).toBe('run.completed');
    expect(verdict.finalIdeaRef).toBe('c1');
  });

  // spec(§3) — failed iff no generation ever produced a scored survivor; reason + partial summary.
  test('failed_when_no_scored_survivor', () => {
    const log = [genStarted(), candidateCreated('c1')];
    const verdict = classifyRunTerminal({ log });
    expect(verdict.status).toBe('failed');
    expect(verdict.terminalEvent).toBe('run.failed');
    expect(verdict.reason).toBe('no_scored_survivor');
    expect(verdict.partialSummary).toBeDefined();
    expect(verdict.partialSummary?.scoredSurvivorCount).toBe(0);
    expect(verdict.partialSummary?.finalIdeaRef).toBeNull();
  });

  // spec(§3) + rule #7 — finalIdeaRef = top-`total` survivor, tie-broken by LOWEST sequence (replay-stable).
  test('final_idea_is_best_scored_survivor_deterministic', () => {
    const log = [
      fitnessScored('c1', 0.5, 5),
      fitnessScored('c2', 0.9, 6), // tied top total, higher sequence
      fitnessScored('c3', 0.9, 4), // tied top total, LOWER sequence → wins
    ];
    const verdict = classifyRunTerminal({ log });
    expect(verdict.status).toBe('completed');
    expect(verdict.finalIdeaRef).toBe('c3');
  });

  // Islands pivot A2 — multi-winner. maxWinners=2 crowns the top-2 by total (tie-break lowest sequence) as
  // finalIdeaRefs[]; finalIdeaRef stays the top one (backward compat).
  test('multi_winner_crowns_top_N_when_maxWinners_2', () => {
    const log = [
      fitnessScored('c1', 0.9, 1),
      fitnessScored('c2', 0.7, 2),
      fitnessScored('c3', 0.5, 3),
    ];
    const verdict = classifyRunTerminal({ log, maxWinners: 2 });
    expect(verdict.status).toBe('completed');
    expect(verdict.finalIdeaRefs).toEqual(['c1', 'c2']);
    expect(verdict.finalIdeaRef).toBe('c1'); // the top winner, preserved
  });

  // The default (no maxWinners) crowns the top-2 (DEFAULT_MAX_WINNERS = 2, the Islands-pivot activation).
  test('default_maxWinners_crowns_top_2', () => {
    const log = [
      fitnessScored('c1', 0.9, 1),
      fitnessScored('c2', 0.7, 2),
      fitnessScored('c3', 0.5, 3),
    ];
    const verdict = classifyRunTerminal({ log });
    expect(verdict.finalIdeaRefs).toEqual(['c1', 'c2']); // top-2 by total
    expect(verdict.finalIdeaRef).toBe('c1'); // the top winner, preserved
  });

  // A single scored survivor → exactly one winner even at the default cap of 2 (slice <= length).
  test('default_with_one_survivor_crowns_one', () => {
    const verdict = classifyRunTerminal({ log: [fitnessScored('c1', 0.9, 1)] });
    expect(verdict.finalIdeaRefs).toEqual(['c1']);
    expect(verdict.finalIdeaRef).toBe('c1');
  });

  // The acceptance floor excludes a high-TOTAL candidate whose judge acceptance is below the floor (rule #1
  // cap on crowning) — even though it ranks first by total.
  test('acceptance_floor_excludes_low_acceptance_high_total', () => {
    const log = [
      fitnessScoredAcc('c1', 0.9, 0.2, 1), // top total but acceptance below floor → excluded
      fitnessScoredAcc('c2', 0.7, 0.6, 2), // clears the floor → crowned
    ];
    const verdict = classifyRunTerminal({ log, maxWinners: 2, acceptanceFloor: 0.5 });
    expect(verdict.status).toBe('completed');
    expect(verdict.finalIdeaRefs).toEqual(['c2']);
  });

  // Survivors exist but NONE clear the floor → completed with finalIdeaRefs:[] (an island with no doppel),
  // NOT failed (failed is reserved for no scored survivor at all).
  test('floor_can_yield_zero_winners_still_completed', () => {
    const log = [fitnessScoredAcc('c1', 0.9, 0.2, 1), fitnessScoredAcc('c2', 0.7, 0.3, 2)];
    const verdict = classifyRunTerminal({ log, maxWinners: 2, acceptanceFloor: 0.5 });
    expect(verdict.status).toBe('completed');
    expect(verdict.terminalEvent).toBe('run.completed');
    expect(verdict.finalIdeaRefs).toEqual([]);
    expect(verdict.finalIdeaRef).toBeUndefined();
  });

  // A survivor with NO recorded judge acceptance is NOT excluded by the floor (a judge-less run still crowns).
  test('floor_does_not_exclude_a_survivor_without_acceptance', () => {
    const log = [fitnessScored('c1', 0.8, 1)]; // no components.judge_acceptance
    const verdict = classifyRunTerminal({ log, maxWinners: 2, acceptanceFloor: 0.9 });
    expect(verdict.status).toBe('completed');
    expect(verdict.finalIdeaRefs).toEqual(['c1']);
  });

  // spec(§3) + LESSONS §54/§63 — selected = scored ∧ ¬culled; a scored-then-culled candidate is excluded.
  test('scored_then_culled_is_not_a_survivor', () => {
    const log = [genStarted(), fitnessScored('c1', 0.9), culled('c1')];
    const verdict = classifyRunTerminal({ log });
    expect(verdict.status).not.toBe('completed');
    expect(verdict.status).toBe('failed');
    expect(verdict.terminalEvent).toBe('run.failed');
    expect(verdict.reason).toBe('no_scored_survivor');
  });

  // spec(§5:210) — energy_exhausted is mid-flight (run-status no-op, lifecycle.ts:11-13); after it the
  // classifier still emits the REAL terminal: a survivor verified before exhaustion → completed. The
  // energy-exhaustion KillPlanSummary does NOT short-circuit to run.failed (it falls through to survivor).
  test('energy_exhausted_then_classify_emits_real_terminal_completed', () => {
    const log = [genStarted(), fitnessScored('c1', 0.7), energyExhausted()];
    const verdict = classifyRunTerminal({ log, killSummary: energyExhaustionKill });
    expect(verdict.status).toBe('completed');
    expect(verdict.terminalEvent).toBe('run.completed');
    expect(verdict.finalIdeaRef).toBe('c1');
  });

  // spec(§5:210) — energy_exhausted with NO scored survivor → the real terminal is run.failed{no_scored_survivor}.
  test('energy_exhausted_then_classify_emits_real_terminal_failed', () => {
    const log = [genStarted(), candidateCreated('c1'), energyExhausted()];
    const verdict = classifyRunTerminal({ log });
    expect(verdict.status).toBe('failed');
    expect(verdict.terminalEvent).toBe('run.failed');
    expect(verdict.reason).toBe('no_scored_survivor');
  });

  // spec(§5) — operator stop of a RUNNING run → stopped, preserving the partial summary (the kill evidence).
  test('operator_stop_classifies_stopped', () => {
    const log = [genStarted(), candidateCreated('c1')];
    const verdict = classifyRunTerminal({ log, killSummary: operatorStopRunning });
    expect(verdict.status).toBe('stopped');
    expect(verdict.terminalEvent).toBe('run.stopped');
    expect(verdict.partialSummary).toBeDefined();
    expect(verdict.partialSummary?.killSummary?.reason).toBe('operator_stop');
  });

  // spec(§5/§4) — operator stop of a not-yet-running CONFIGURED run → cancelled (sv5 run.cancelled).
  test('operator_stop_of_configured_classifies_cancelled', () => {
    const verdict = classifyRunTerminal({ log: [], killSummary: operatorStopConfigured });
    expect(verdict.status).toBe('cancelled');
    expect(verdict.terminalEvent).toBe('run.cancelled');
  });

  // spec(§5) — a crash-detected non-terminal run (P3.13 boot caller passes crashed:true) → failed{crash}.
  test('crash_classifies_failed_crash', () => {
    const log = [genStarted(), candidateCreated('c1')];
    const verdict = classifyRunTerminal({ log, crashed: true });
    expect(verdict.status).toBe('failed');
    expect(verdict.terminalEvent).toBe('run.failed');
    expect(verdict.reason).toBe('crash');
    expect(verdict.partialSummary).toBeDefined();
  });

  // rule #7 — the same persisted log yields a byte-identical verdict; the modules import no provider/web/
  // store-write symbol and make no Math.random/Date.now/fetch call (pure, replay-stable). Positive-guarded.
  test('terminal_verdict_is_replay_stable', () => {
    const log = [fitnessScored('c1', 0.5, 1), fitnessScored('c2', 0.7, 2)];
    const a = classifyRunTerminal({ log });
    const b = classifyRunTerminal({ log });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a).toEqual(b);

    const files = ['terminalClassifier.ts', 'partialSummary.ts'].map((f) =>
      readFileSync(
        fileURLToPath(new URL(`../../../../src/runtime/terminal/${f}`, import.meta.url)),
        'utf8',
      ),
    );
    expect(files.length).toBe(2);
    const importBan =
      /from\s+['"][^'"]*(model-gateway|gateway|openai|@anthropic|openrouter|embedding|retrieval|web-search|axios|node-fetch|undici|node:http)/i;
    for (const src of files) {
      expect(src.length).toBeGreaterThan(0);
      expect(importBan.test(src)).toBe(false);
      expect(/Math\.random\s*\(/.test(src)).toBe(false); // no RNG
      expect(/Date\.now\s*\(/.test(src)).toBe(false); // no clock
      expect(/\bfetch\s*\(/.test(src)).toBe(false); // no web call
    }
  });

  // spec(§3) terminal-immutability + P3.2 — an already-terminal run (ANY of the 4 REAL terminal events the
  // loop emits in production) re-classifies to a NO-OP (terminalEvent null); the executor appends nothing
  // because runTerminalPath(terminal, …) = null (from_terminal). energy_exhausted is NOT in this set.
  test('already_terminal_run_admits_no_reclassification', () => {
    const terminals: ReadonlyArray<readonly [RunEventType, RunStatus]> = [
      ['run.completed', 'completed'],
      ['run.failed', 'failed'],
      ['run.stopped', 'stopped'],
      ['run.cancelled', 'cancelled'],
    ];
    for (const [evt, status] of terminals) {
      const log = [
        genStarted(),
        fitnessScored('c1', 0.8),
        row({ type: evt, payload: { to: status } }),
      ];
      const verdict = classifyRunTerminal({ log });
      expect(verdict.terminalEvent).toBeNull(); // no further terminal event
      expect(verdict.status).toBe(status);
      expect(runTerminalPath(status, status)).toBeNull(); // from_terminal → executor appends nothing
    }
  });

  // P3.2 guard backstop — the executor validates the FULL legal path from the run's ACTUAL current status
  // (running at loop exit) to the terminal, routing through the transient completing/stopping intermediate
  // (no event per §4/Q4): completed = running→completing→completed; failed = the clean single hop
  // running→failed; stopped = running→stopping→stopped; cancelled = configured→cancelled. A from-terminal
  // mapping yields null (never a forced/illegal append).
  test('terminal_transition_is_guard_validated', () => {
    expect(runTerminalPath('running', 'completed')).toEqual(['completing', 'completed']);
    expect(runTerminalPath('running', 'failed')).toEqual(['failed']);
    expect(runTerminalPath('running', 'stopped')).toEqual(['stopping', 'stopped']);
    expect(runTerminalPath('configured', 'cancelled')).toEqual(['cancelled']);

    // every hop in each path is canTransitionRun-legal (the path IS guard-validated, not a forced relabel).
    for (const [from, to] of [
      ['running', 'completed'],
      ['running', 'failed'],
      ['running', 'stopped'],
      ['configured', 'cancelled'],
    ] as ReadonlyArray<readonly [RunStatus, RunStatus]>) {
      const path = runTerminalPath(from, to)!;
      let cursor: RunStatus = from;
      for (const hop of path) {
        expect(canTransitionRun(cursor, hop).allowed).toBe(true);
        cursor = hop;
      }
      expect(cursor).toBe(to); // the path ends at the terminal
    }

    // a from-terminal mapping is rejected (the guard the executor relies on — no exit from a terminal).
    expect(runTerminalPath('completed', 'failed')).toBeNull();
    expect(runTerminalPath('stopped', 'completed')).toBeNull();
  });

  // buildPartialTerminalSummary composes the scored-survivor history + the optional KillPlanSummary (pure).
  test('partial_summary_composes_survivor_history_and_kill', () => {
    const log = [genStarted(), fitnessScored('c1', 0.6), fitnessScored('c2', 0.9), culled('c2')];
    const summary = buildPartialTerminalSummary(log, operatorStopRunning);
    expect(summary.generationsObserved).toBe(1);
    expect(summary.scoredSurvivorCount).toBe(1); // c2 culled → only c1 survives
    expect(summary.finalIdeaRef).toBe('c1');
    expect(summary.killSummary).toEqual(operatorStopRunning);
  });

  // CULL-EFFECT FIX — the REAL cull shape (lineage.culled targetIds = AGENOME ids, no envelope candidateId)
  // must exclude that lineage's candidate from the survivors/winner. Before the fix, the agenomeId-vs-
  // candidateId mismatch let a culled lineage still win. c2 (0.9) is higher but its agenome ag2 is culled →
  // only c1 (0.6) survives and wins.
  test('agenome_keyed_cull_excludes_lineage_from_survivors_and_winner', () => {
    const log = [
      genStarted(),
      candidateCreatedFor('c1', 'ag1'),
      candidateCreatedFor('c2', 'ag2'),
      fitnessScored('c1', 0.6),
      fitnessScored('c2', 0.9),
      culledAgenomes(['ag2']),
    ];
    const summary = buildPartialTerminalSummary(log);
    expect(summary.scoredSurvivorCount).toBe(1);
    expect(summary.finalIdeaRef).toBe('c1');
  });
});
