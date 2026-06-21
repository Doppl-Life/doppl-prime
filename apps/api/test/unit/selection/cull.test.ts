import { describe, expect, test } from 'vitest';
import { CURRENT_SCHEMA_VERSION, CullingEvent } from '@doppl/contracts';
import type { AgenomeStatus, RunEventEnvelope } from '@doppl/contracts';
import { cull } from '../../../src/selection/cull';
import type { CullEmitter, CullInput, CullPolicy } from '../../../src/selection/cull';

type Emitted = Omit<RunEventEnvelope, 'sequence' | 'occurredAt'>;

function recorder(): { emit: CullEmitter; events: Emitted[] } {
  const events: Emitted[] = [];
  let seq = 0;
  const emit: CullEmitter = (env) => {
    events.push(env);
    return Promise.resolve({ sequence: seq++ });
  };
  return { emit, events };
}

function idFactory(): () => string {
  let n = 0;
  return () => `evt_${n++}`;
}

function agenome(
  agenomeId: string,
  totals: number[],
  status: AgenomeStatus = 'eligible_parent',
): CullInput['agenomes'][number] {
  return {
    agenomeId,
    status,
    candidates: totals.map((total, i) => ({ candidateId: `${agenomeId}_c${i}`, total })),
  };
}

const policy: CullPolicy = { minFitness: 0.5 };

function input(agenomes: CullInput['agenomes']): CullInput {
  return { runId: 'run_1', generationId: 'gen_1', agenomes };
}

/**
 * cull (P5.7, §8) — culls weak lineages from persisted FitnessScores (best-candidate total below the
 * injected threshold) and emits one explainable lineage.culled (CullingEvent). Pure compose + emit;
 * nothing culled → no event.
 */
describe('cull — weak-lineage culling + explainable lineage.culled', () => {
  // 1 — spec(§8): agenomes whose best candidate total < threshold are culled; survivors are not.
  test('cull_selects_weak_by_criterion', async () => {
    const { emit } = recorder();
    const { culledIds } = await cull(
      input([agenome('a_weak', [0.2, 0.3]), agenome('a_strong', [0.9])]),
      policy,
      { emit, newId: idFactory() },
    );
    expect(culledIds).toContain('a_weak');
    expect(culledIds).not.toContain('a_strong');
  });

  // 2 — spec(§8): exactly one lineage.culled; payload parses against the frozen CullingEvent (explicit
  // validate, NOT the append generic fall-through); correct envelope.
  test('cull_emits_one_lineage_culled_validated', async () => {
    const { emit, events } = recorder();
    await cull(input([agenome('a_weak', [0.2])]), policy, { emit, newId: idFactory() });
    const culled = events.filter((e) => e.type === 'lineage.culled');
    expect(culled).toHaveLength(1);
    const env = culled[0]!;
    expect(env.actor).toBe('selection_controller');
    expect(env.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(env.runId).toBe('run_1');
    expect(() => CullingEvent.parse(env.payload)).not.toThrow();
  });

  // 3 — spec(§8): scoreSnapshot carries each culled target's justifying score + reason is set.
  test('cull_event_scoreSnapshot_justifies', async () => {
    const { emit } = recorder();
    const { cullingEvent } = await cull(input([agenome('a_weak', [0.2, 0.35])]), policy, {
      emit,
      newId: idFactory(),
    });
    expect(cullingEvent).toBeDefined();
    expect(cullingEvent!.scoreSnapshot.a_weak).toBeCloseTo(0.35, 12); // best total of the culled agenome
    expect(cullingEvent!.reason.length).toBeGreaterThan(0);
    expect(cullingEvent!.targetIds).toEqual(['a_weak']);
  });

  // 4 — CullingEvent targetIds ≥1 kernel rule: nothing culled → no lineage.culled emitted.
  test('cull_nothing_culled_no_event', async () => {
    const { emit, events } = recorder();
    const { culledIds, cullingEvent } = await cull(
      input([agenome('a_strong', [0.9]), agenome('b_strong', [0.7])]),
      policy,
      { emit, newId: idFactory() },
    );
    expect(culledIds).toEqual([]);
    expect(cullingEvent).toBeUndefined();
    expect(events.filter((e) => e.type === 'lineage.culled')).toHaveLength(0);
  });

  // 5 — purity: cull does not mutate its inputs.
  test('cull_does_not_mutate_inputs', async () => {
    const inp = input([agenome('a_weak', [0.2]), agenome('a_strong', [0.9])]);
    const snapshot = structuredClone(inp);
    const { emit } = recorder();
    await cull(inp, policy, { emit, newId: idFactory() });
    expect(inp).toEqual(snapshot);
  });

  // 6 — replay-faithful: same inputs+policy → identical culledIds + event content.
  test('cull_deterministic', async () => {
    const inp = input([agenome('a_weak', [0.2]), agenome('b_weak', [0.1])]);
    const a = await cull(inp, policy, { emit: recorder().emit, newId: idFactory() });
    const b = await cull(inp, policy, { emit: recorder().emit, newId: idFactory() });
    expect(a.culledIds).toEqual(b.culledIds);
    expect(a.cullingEvent?.targetIds).toEqual(b.cullingEvent?.targetIds);
    expect(a.cullingEvent?.scoreSnapshot).toEqual(b.cullingEvent?.scoreSnapshot);
  });

  // 7 — no work on culled/spent/failed: an already-culled/spent/failed agenome is never re-culled.
  test('cull_skips_terminal_state_agenomes', async () => {
    const { emit } = recorder();
    const { culledIds } = await cull(
      input([
        agenome('a_culled', [0.1], 'culled'),
        agenome('a_spent', [0.1], 'spent'),
        agenome('a_failed', [0.1], 'failed'),
        agenome('a_weak', [0.1], 'eligible_parent'),
      ]),
      policy,
      { emit, newId: idFactory() },
    );
    expect(culledIds).toEqual(['a_weak']);
  });

  // 8 — boundary: an agenome with NO scored candidates has no fitness basis → it is NOT culled
  // (best of [] = -Infinity would mis-cull it as "weak"). It is skipped, not culled.
  test('cull_skips_agenome_with_no_scored_candidates', async () => {
    const { emit } = recorder();
    const { culledIds } = await cull(
      input([agenome('a_unscored', []), agenome('a_weak', [0.1])]),
      policy,
      { emit, newId: idFactory() },
    );
    expect(culledIds).toEqual(['a_weak']);
    expect(culledIds).not.toContain('a_unscored');
  });
});
