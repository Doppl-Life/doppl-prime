import { describe, expect, test } from 'vitest';
import { Agenome } from '@doppl/contracts';
import { materializeGen0 } from '../../../../src/runtime/seed/gen0SeedSet';
import type { SeedAgenomeSet } from '../../../../src/runtime/seed/seedAgenomes.config';

/**
 * P3.9 gen-0 materializer (ARCHITECTURE.md §3 gen-0 baseline, §4 replay determinism, §5/rule #1
 * maxPopulation-respect). PURE: authored templates → the run's gen-0 Agenome[] (empty parentIds, seeded
 * status, deterministic positional ids), clamped to maxPopulation via the kernel-024 spawnBudget clamp.
 * The `agenome.spawned` emission is the worker/loop's (P3.10/P3.12).
 */

const SEED_SET: SeedAgenomeSet = [
  {
    systemPrompt: 'p0',
    personaWeights: { a: 1 },
    toolPermissions: ['retrieval'],
    decompositionPolicy: 'bf',
    spawnBudget: 2,
  },
  {
    systemPrompt: 'p1',
    personaWeights: { b: 1 },
    toolPermissions: [],
    decompositionPolicy: 'df',
    spawnBudget: 3,
  },
  {
    systemPrompt: 'p2',
    personaWeights: { c: 1 },
    toolPermissions: ['retrieval', 'search'],
    decompositionPolicy: 'bf',
    spawnBudget: 0,
  },
];

describe('materializeGen0 (P3.9 — gen-0 seeded agenomes)', () => {
  test('materialize_produces_valid_seeded_agenomes', () => {
    // spec(§3) P0.4: gen-0 agenomes have NO parents + seeded status + deterministic ids + the authored
    // traits; each round-trips the FROZEN Agenome schema.
    const agenomes = materializeGen0(SEED_SET, 'run_1', 'gen0_1', 10);
    expect(agenomes).toHaveLength(3);
    agenomes.forEach((a, i) => {
      expect(a.parentIds).toEqual([]);
      expect(a.status).toBe('seeded');
      expect(a.id).toBe(`run_1-gen0-${i}`);
      expect(a.runId).toBe('run_1');
      expect(a.generationId).toBe('gen0_1');
      expect(a.systemPrompt).toBe(SEED_SET[i]!.systemPrompt);
      expect(a.spawnBudget).toBe(SEED_SET[i]!.spawnBudget);
      expect(Agenome.parse(a)).toEqual(a); // parses against the frozen contract
    });
  });

  test('materialize_respects_max_population', () => {
    // spec(§5)/rule #1: count = min(seedSet.length, maxPopulation) via clampSpawnBudget — a seed set larger
    // than the cap is clamped DOWN; the run never materializes more gen-0 agenomes than the cap permits.
    expect(materializeGen0(SEED_SET, 'run_1', 'gen0_1', 10)).toHaveLength(3); // under cap → all
    expect(materializeGen0(SEED_SET, 'run_1', 'gen0_1', 2)).toHaveLength(2); // over cap → clamped to cap
    expect(materializeGen0(SEED_SET, 'run_1', 'gen0_1', 0)).toHaveLength(0); // no headroom → none
  });

  test('materialize_is_deterministic', () => {
    // spec(§4): same (seedSet, runId, generationId, maxPopulation) → equal Agenome[] (replay-stable ids).
    expect(materializeGen0(SEED_SET, 'run_1', 'gen0_1', 10)).toEqual(
      materializeGen0(SEED_SET, 'run_1', 'gen0_1', 10),
    );
  });
});
