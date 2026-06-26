import { describe, expect, test } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import type { Agenome, RunEventType } from '@doppl/contracts';
import type { RunEventRow } from '../../../../src/event-store';
import {
  resolveEligibleParents,
  withChampionParent,
} from '../../../../src/runtime/loop/generationLoop';

/**
 * resolveEligibleParents (the cull-effect fix) — a candidate is an eligible reproduction parent iff its
 * `fitness.scored` is present this generation AND its lineage was NOT `lineage.culled`. The REAL cull is
 * AGENOME-keyed (`cull` emits the culled agenome ids in `payload.targetIds`, NO envelope `candidateId`); the
 * prior code skipped every cull row and read only `row.candidateId`, so a culled lineage was IGNORED and kept
 * breeding. Now exclusion matches EITHER the candidate id OR its agenome id.
 */

let autoSeq = 0;
function row(over: Partial<RunEventRow> & { type: RunEventType }): RunEventRow {
  const sequence = over.sequence ?? autoSeq++;
  return {
    id: over.id ?? `e-${sequence}`,
    runId: over.runId ?? 'run_1',
    generationId: over.generationId ?? GEN,
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

const GEN = 'run_1-gen0';
const ag = (id: string): Agenome => ({ id }) as unknown as Agenome;
const candidateAgenome = (pairs: [string, string][]): Map<string, Agenome> =>
  new Map(pairs.map(([candidateId, agenomeId]) => [candidateId, ag(agenomeId)]));

const fitnessScored = (candidateId: string, generationId = GEN): RunEventRow =>
  row({ type: 'fitness.scored', generationId, candidateId, payload: { candidateId, total: 0.5 } });
// The REAL cull shape: AGENOME ids in targetIds, no envelope candidateId.
const culledAgenomes = (agenomeIds: string[]): RunEventRow =>
  row({
    type: 'lineage.culled',
    generationId: GEN,
    payload: { targetIds: agenomeIds, reason: 'truncation', scoreSnapshot: {} },
  });

describe('resolveEligibleParents — honours the agenome-keyed lineage.culled', () => {
  test('agenome_keyed_cull_excludes_its_candidate_from_parents', () => {
    const log = [fitnessScored('c1'), fitnessScored('c2'), culledAgenomes(['ag2'])];
    const parents = resolveEligibleParents(
      log,
      GEN,
      candidateAgenome([
        ['c1', 'ag1'],
        ['c2', 'ag2'],
      ]),
    );
    expect(parents.map((p) => p.id)).toEqual(['ag1']); // ag2 culled → only ag1 breeds
  });

  test('uncrulled_lineages_are_all_eligible', () => {
    const log = [fitnessScored('c1'), fitnessScored('c2')];
    const parents = resolveEligibleParents(
      log,
      GEN,
      candidateAgenome([
        ['c1', 'ag1'],
        ['c2', 'ag2'],
      ]),
    );
    expect(parents.map((p) => p.id).sort()).toEqual(['ag1', 'ag2']);
  });

  test('per_candidate_cull_form_is_also_excluded', () => {
    // Defensive: a cull that set the envelope candidateId (e.g. a per-candidate cull) still excludes.
    const log = [
      fitnessScored('c1'),
      fitnessScored('c2'),
      row({
        type: 'lineage.culled',
        generationId: GEN,
        candidateId: 'c2',
        payload: { targetIds: ['c2'], reason: 'x', scoreSnapshot: {} },
      }),
    ];
    const parents = resolveEligibleParents(
      log,
      GEN,
      candidateAgenome([
        ['c1', 'ag1'],
        ['c2', 'ag2'],
      ]),
    );
    expect(parents.map((p) => p.id)).toEqual(['ag1']);
  });

  test('only_this_generations_scored_candidates_count', () => {
    const log = [fitnessScored('c1'), fitnessScored('cX', 'run_1-gen1')];
    const parents = resolveEligibleParents(
      log,
      GEN,
      candidateAgenome([
        ['c1', 'ag1'],
        ['cX', 'agX'],
      ]),
    );
    expect(parents.map((p) => p.id)).toEqual(['ag1']);
  });
});

/**
 * withChampionParent (Wave 1 Step 1 — the ratchet / hall-of-fame carry, rule #1/#7) — the pure decision that
 * ALWAYS re-presents the reigning champion as a reproduction parent when `hallOfFameCarry > 0`, even after
 * its re-rolled candidate was culled out of `eligibleParents` (the bounce). A PARENT only (the offspring
 * count is the kernel's independent `spawnBudget`, never raised here — rule #1); deduped by id; off by
 * default → byte-identical to HEAD.
 */
describe('withChampionParent — the hall-of-fame ratchet (pure)', () => {
  const eligible = [ag('a1'), ag('a2')];
  const champ = ag('champ');

  // off by default (carry 0) → input UNCHANGED (HEAD-identical), even with a champion stashed.
  test('test_carry_zero_is_head_identical', () => {
    expect(withChampionParent(eligible, champ, 0)).toBe(eligible);
  });

  // a negative carry is also off.
  test('test_negative_carry_off', () => {
    expect(withChampionParent(eligible, champ, -1)).toBe(eligible);
  });

  // no champion yet → input UNCHANGED.
  test('test_no_champion_unchanged', () => {
    expect(withChampionParent(eligible, null, 1)).toBe(eligible);
  });

  // carry > 0 + champion NOT in the eligible set (its re-roll was culled) → champion APPENDED as a parent.
  test('test_culled_champion_re_presented_as_parent', () => {
    const result = withChampionParent(eligible, champ, 1);
    expect(result.map((p) => p.id)).toEqual(['a1', 'a2', 'champ']);
  });

  // carry > 0 + champion ALREADY eligible (its candidate survived) → NO duplicate (returns input unchanged).
  test('test_already_eligible_champion_not_doubled', () => {
    const withChamp = [ag('a1'), ag('champ')];
    const result = withChampionParent(withChamp, champ, 1);
    expect(result).toBe(withChamp);
    expect(result.map((p) => p.id)).toEqual(['a1', 'champ']);
  });

  // the champion rides through BYTE-IDENTICAL (no re-home / mutation) — its Agenome object is the same ref.
  test('test_champion_agenome_unchanged', () => {
    const result = withChampionParent(eligible, champ, 1);
    expect(result[result.length - 1]).toBe(champ);
  });
});
