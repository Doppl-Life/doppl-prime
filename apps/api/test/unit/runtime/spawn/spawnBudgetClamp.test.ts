import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clampSpawnBudget } from '../../../../src/runtime/spawn/spawnBudgetClamp';

/**
 * P3.9 spawnBudget clamp (ARCHITECTURE.md §5, KEY SAFETY RULE #1). A PURE decision treating an agenome's
 * `spawnBudget` hint as an allocation ceiling-bounded request: `effectiveSpawns = min(spawnBudget,
 * max(0, remainingPopulation))` — the hint can NEVER raise the population cap. Decision only; the spawn
 * caller (P3.9-seed / P3.10) emits the clamp-decision event when `clamped`. Population headroom only —
 * the spawn-depth ceiling is a SEPARATE P3.4 `enforceCap('maxSpawnDepth', …)` gate, not this clamp.
 */

const CLAMP_SRC = fileURLToPath(
  new URL('../../../../src/runtime/spawn/spawnBudgetClamp.ts', import.meta.url),
);

describe('clampSpawnBudget (P3.9 — rule #1 hint clamp)', () => {
  test('clamp_allows_budget_under_remaining', () => {
    // spec(§5): the hint is honored when it fits — under remaining and exactly at remaining (inclusive).
    expect(clampSpawnBudget(3, 5)).toEqual({ effectiveSpawns: 3, clamped: false });
    expect(clampSpawnBudget(5, 5)).toEqual({ effectiveSpawns: 5, clamped: false }); // == headroom, fully fits
  });

  test('clamp_caps_budget_to_remaining', () => {
    // spec(§5) rule #1: a hint above remaining is clamped DOWN to remaining — the trait can't raise the cap.
    expect(clampSpawnBudget(8, 3)).toEqual({ effectiveSpawns: 3, clamped: true });
    expect(clampSpawnBudget(4, 3)).toEqual({ effectiveSpawns: 3, clamped: true }); // cap+? → remaining
  });

  test('clamp_zero_when_no_headroom', () => {
    // spec(§5) "spawn respects maxPopulation": at/over the cap → 0 spawns; max(0,…) guards negative remaining.
    expect(clampSpawnBudget(4, 2).effectiveSpawns).toBe(2); // positive headroom first (lesson §10)
    expect(clampSpawnBudget(4, 0)).toEqual({ effectiveSpawns: 0, clamped: true });
    expect(clampSpawnBudget(4, -3)).toEqual({ effectiveSpawns: 0, clamped: true }); // negative → 0
  });

  test('clamp_zero_budget', () => {
    // a zero hint requests nothing — effectiveSpawns 0 and NOT a clamp (it wasn't reduced below the hint).
    expect(clampSpawnBudget(0, 5)).toEqual({ effectiveSpawns: 0, clamped: false });
    expect(clampSpawnBudget(0, 0)).toEqual({ effectiveSpawns: 0, clamped: false });
  });

  test('clamp_reads_only_budget_and_remaining', () => {
    // rule #1 (structural): the result is a function of ONLY (spawnBudget, remainingPopulation) — lowering
    // remaining lowers the ceiling; nothing else widens it. The module reads no agenome object / other
    // trait (no `agenome` token in source), so no trait can raise the cap by shape.
    expect(clampSpawnBudget(10, 100).effectiveSpawns).toBe(10); // generous headroom honors the hint
    expect(clampSpawnBudget(10, 1).effectiveSpawns).toBe(1); // tight headroom is the sole limiter
    expect(readFileSync(CLAMP_SRC, 'utf8')).not.toMatch(/agenome/i);
  });

  test('clamp_is_pure', () => {
    // lesson §33: same inputs → equal result (no IO/mutation — both inputs are scalars).
    expect(clampSpawnBudget(7, 4)).toEqual(clampSpawnBudget(7, 4));
  });
});
