import { describe, expect, test } from 'vitest';
import {
  loadCuratedCorpus,
  searchCuratedCorpus,
} from '../../../../src/model-gateway/adapters/curated-corpus';
import type { CuratedCorpus } from '../../../../src/model-gateway/adapters/curated-corpus';

/**
 * P2.7 curated prior-art/signals corpus (ARCHITECTURE.md §6 demo-safety, KEY SAFETY RULE #7 replay).
 *
 * `searchCuratedCorpus` is a PURE lookup over the static corpus passed in (no IO/clock/random — lesson
 * §4) so it is replay-safe and deterministic. The corpus is the rehearsed fallback grounding when live
 * web-search is unavailable.
 */

const TEST_CORPUS: CuratedCorpus = [
  {
    label: 'Cross-domain transfer in ML',
    snippet: 'Applying a technique from one domain to a problem in another.',
    uri: 'https://example.test/transfer',
    keywords: ['transfer', 'cross', 'domain'],
  },
  {
    label: 'Diffusion generative models',
    snippet: 'Iterative denoising for sample generation.',
    keywords: ['diffusion', 'generative'],
  },
  {
    label: 'Attention mechanisms',
    snippet: 'Weighting inputs by learned relevance.',
    uri: 'https://example.test/attention',
    keywords: ['attention', 'transformer'],
  },
];

describe('searchCuratedCorpus — pure, deterministic, replay-safe (lesson §4 / rule #7)', () => {
  // spec(§4/§6) — same corpus+query+params twice yields identical results; bounded by maxResults; each
  // result tagged the requested kind; pure (no IO/clock/random).
  test('curated_search_is_pure_deterministic', () => {
    const params = { kind: 'prior_art' as const, maxResults: 2 };
    const first = searchCuratedCorpus(TEST_CORPUS, 'transfer domain', params);
    const second = searchCuratedCorpus(TEST_CORPUS, 'transfer domain', params);
    expect(first).toEqual(second); // deterministic
    expect(first.length).toBeLessThanOrEqual(2); // bounded by maxResults
    expect(first.length).toBeGreaterThan(0); // positive guard (lesson §10)
    expect(first.every((r) => r.kind === 'prior_art')).toBe(true); // tagged requested kind
  });

  // spec(§6) — maxResults truncates; the requested kind tags every item even on the signal path.
  test('curated_search_respects_max_results_and_signal_kind', () => {
    const results = searchCuratedCorpus(TEST_CORPUS, 'transfer diffusion attention', {
      kind: 'signal',
      maxResults: 1,
    });
    expect(results.length).toBe(1);
    expect(results[0]?.kind).toBe('signal');
  });

  // spec(§6) — "no grounding found" is valid: a query matching nothing returns []. Empty is data.
  test('curated_search_no_match_returns_empty', () => {
    const results = searchCuratedCorpus(TEST_CORPUS, 'zzzznomatchxyz', {
      kind: 'prior_art',
      maxResults: 5,
    });
    expect(results).toEqual([]);
  });
});

describe('loadCuratedCorpus — default + override loader', () => {
  // spec(§6) — loads the default operator-curated corpus, or an override; carries NO secrets.
  test('load_curated_corpus_default_and_override', () => {
    const def = loadCuratedCorpus();
    expect(Array.isArray(def)).toBe(true);
    expect(def.length).toBeGreaterThan(0); // positive guard
    const override = loadCuratedCorpus(TEST_CORPUS);
    expect(override).toBe(TEST_CORPUS);
  });
});
