import { describe, expect, it } from 'vitest';
import {
  agenomeLens,
  parseMutationStrategy,
  strategyParams,
  LENS_PREFIX,
} from '../../../../src/runtime/loop/mutagenStrategy';

describe('mutagenStrategy (experiment)', () => {
  it('parses the strategy enum + falls back to fusion_only on garbage', () => {
    expect(parseMutationStrategy('adaptive')).toBe('adaptive');
    expect(parseMutationStrategy('mutate_lens')).toBe('mutate_lens');
    expect(parseMutationStrategy(undefined)).toBe('fusion_only');
    expect(parseMutationStrategy('nonsense')).toBe('fusion_only');
  });

  it('fusion_only never mutates; others split r/K + escalate capabilities', () => {
    expect(strategyParams('fusion_only').usesMutation).toBe(false);
    expect(strategyParams('fusion_only').baseMutationFraction).toBe(0);
    expect(strategyParams('mutate_static').usesMutation).toBe(true);
    expect(strategyParams('mutate_static').usesPerAgenomeLens).toBe(false);
    expect(strategyParams('mutate_lens').usesPerAgenomeLens).toBe(true);
    expect(strategyParams('adaptive').usesAdaptiveFraction).toBe(true);
  });

  it('agenomeLens extracts lens.<operator> weights over threshold, in enum order', () => {
    const weights = {
      explorer: 0.9, // not a lens key → ignored
      [`${LENS_PREFIX}polymath`]: 0.8,
      [`${LENS_PREFIX}blindside`]: 0.6,
      [`${LENS_PREFIX}constraint`]: 0.2, // below threshold → excluded
      [`${LENS_PREFIX}not_an_operator`]: 1, // out of enum → ignored
    };
    expect(agenomeLens(weights)).toEqual(['polymath', 'blindside']); // enum order: polymath before blindside
    expect(agenomeLens({ explorer: 0.9 })).toEqual([]); // no lens keys → empty (falls back to run-level)
  });
});
