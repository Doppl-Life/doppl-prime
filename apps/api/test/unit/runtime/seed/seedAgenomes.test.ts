import { describe, expect, test } from 'vitest';
import { loadConfig } from '../../../../src/runtime/config/loadConfig';
import {
  SeedAgenomeTemplate,
  SeedAgenomeSet,
  DEFAULT_SEED_SET,
} from '../../../../src/runtime/seed/seedAgenomes.config';

/**
 * P3.9 gen-0 authored seed templates (ARCHITECTURE.md §3/§7, REQ-F-017). The AUTHORED baseline carries
 * TRAITS ONLY; the spawn-assigned identity/lineage/status fields are unrepresentable by shape. Boot-
 * validated via loadConfig (P3.1, fail-fast).
 */

const VALID_ENV: Record<string, string | undefined> = {
  OPENROUTER_API_KEY: 'or-key',
  OPENAI_API_KEY: 'oai-key',
  DATABASE_URL: 'postgres://localhost/db',
};

const VALID_TEMPLATE = {
  systemPrompt: 'You are a cross-domain analogist.',
  personaWeights: { explorer: 0.7, skeptic: 0.3 },
  toolPermissions: ['retrieval'],
  decompositionPolicy: 'breadth-first',
  spawnBudget: 2,
};

describe('SeedAgenomeTemplate (P3.9 — authored traits only)', () => {
  test('seed_template_validates_authored_traits', () => {
    // spec(§3): the template carries the 5 trait fields only; the spawn-assigned identity/lineage/status
    // fields are unrepresentable by shape (strictObject rejects them) — materializeGen0 assigns them.
    expect(SeedAgenomeTemplate.safeParse(VALID_TEMPLATE).success).toBe(true);
    for (const spawnAssigned of [
      { id: 'x' },
      { runId: 'r' },
      { generationId: 'g' },
      { parentIds: [] },
      { status: 'seeded' },
      { mutationMeta: {} },
    ]) {
      expect(SeedAgenomeTemplate.safeParse({ ...VALID_TEMPLATE, ...spawnAssigned }).success).toBe(
        false,
      );
    }
  });

  test('default_seed_set_is_valid_and_distinct', () => {
    // REQ-F-017: the authored gen-0 baseline validates + has ≥2 DISTINCT personas/prompts.
    expect(SeedAgenomeSet.safeParse(DEFAULT_SEED_SET).success).toBe(true);
    expect(DEFAULT_SEED_SET.length).toBeGreaterThanOrEqual(2);
    const prompts = new Set(DEFAULT_SEED_SET.map((t) => t.systemPrompt));
    expect(prompts.size).toBe(DEFAULT_SEED_SET.length); // every authored prompt is distinct
  });

  test('malformed_seed_fails_fast_at_boot', () => {
    // spec(§15) P3.1: a malformed seed template aborts boot validation (loadConfig) with a field-pointing,
    // no-value-echo error — never a partial/invalid gen-0.
    const malformed = [{ ...VALID_TEMPLATE, spawnBudget: -1 }]; // negative spawnBudget rejected
    expect(() => loadConfig({ env: VALID_ENV, fileSources: { seedSet: malformed } })).toThrow(
      /seed/i,
    );
  });
});
