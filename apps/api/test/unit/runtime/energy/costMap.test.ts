import { describe, expect, test } from 'vitest';
import {
  energyForLlm,
  energyForTool,
  energyForSpawn,
  DEFAULT_COST_MAP,
  type CostMapConfig,
} from '../../../../src/runtime/energy/costMap';

/**
 * P3.5 cost map (ARCHITECTURE.md §4 — one integer unit `doppl_energy`; cost map
 * `tokensPerUnit:1000, perToolCall:5, perSpawn:50`). PURE + config-driven; the loop (P3.10) emits.
 */

describe('costMap (P3.5 — §4 doppl_energy cost map)', () => {
  test('cost_map_llm_tool_spawn', () => {
    // spec(§4): llm cost = ceil(tokens/tokensPerUnit) (a partial unit costs 1 — conservative, never
    // under-debits so the cap fails closed); tool = perToolCall (5); spawn = perSpawn (50); all integers.
    expect(energyForLlm(1000, DEFAULT_COST_MAP)).toBe(1);
    expect(energyForLlm(1500, DEFAULT_COST_MAP)).toBe(2); // ceil(1.5)
    expect(energyForLlm(1, DEFAULT_COST_MAP)).toBe(1); // ceil(0.001) — partial unit costs 1
    expect(energyForLlm(0, DEFAULT_COST_MAP)).toBe(0);
    expect(energyForTool(DEFAULT_COST_MAP)).toBe(5);
    expect(energyForSpawn(DEFAULT_COST_MAP)).toBe(50);
    for (const v of [
      energyForLlm(1500, DEFAULT_COST_MAP),
      energyForTool(DEFAULT_COST_MAP),
      energyForSpawn(DEFAULT_COST_MAP),
    ]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  test('cost_map_is_config_driven', () => {
    // spec(§4): the cost values come from config (tunable) — NOT hard-coded literals in the logic.
    const tuned: CostMapConfig = { tokensPerUnit: 500, perToolCall: 7, perSpawn: 100 };
    expect(energyForLlm(1000, tuned)).toBe(2); // 1000/500 = 2 (vs 1 with the default map)
    expect(energyForTool(tuned)).toBe(7);
    expect(energyForSpawn(tuned)).toBe(100);
  });
});
