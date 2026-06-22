import type { CuratedCorpus } from '../model-gateway/adapters/curated-corpus';

/**
 * Operator-curated static prior-art / signals corpus (P2.7, ARCHITECTURE.md §6 demo-safety).
 *
 * The rehearsed fallback grounding when live web-search is unavailable or rate-limited (RISK-004/005).
 * Carries NO secrets — purely public prior-art / signal entries. The retrieval adapter's curated path
 * reads ONLY this static data through the pure `searchCuratedCorpus` (no IO/clock/random), so grounding
 * stays deterministic + replay-safe (rule #7). Extend this list as the demo's prepared problems grow.
 */
export const DEFAULT_PRIOR_ART_CORPUS: CuratedCorpus = [
  {
    label: 'Cross-domain transfer of techniques',
    snippet:
      'Mapping a method proven in a source domain onto a target-domain problem — the core move behind analogical innovation.',
    uri: 'https://en.wikipedia.org/wiki/Transfer_learning',
    keywords: ['transfer', 'cross', 'domain', 'analogy', 'technique', 'mapping'],
  },
  {
    label: 'Diffusion generative models',
    snippet:
      'Iterative denoising processes that learn to generate samples from noise; state of the art in image and audio synthesis.',
    uri: 'https://en.wikipedia.org/wiki/Diffusion_model',
    keywords: ['diffusion', 'generative', 'denoising', 'synthesis', 'image'],
  },
  {
    label: 'Attention and transformer architectures',
    snippet:
      'Sequence models that weight inputs by learned relevance; the foundation of modern large language models.',
    uri: 'https://en.wikipedia.org/wiki/Attention_(machine_learning)',
    keywords: ['attention', 'transformer', 'sequence', 'language', 'model'],
  },
  {
    label: 'Evolutionary and population-based search',
    snippet:
      'Optimizing a population of candidates under selection pressure across generations; mutation and recombination explore the space.',
    uri: 'https://en.wikipedia.org/wiki/Evolutionary_algorithm',
    keywords: ['evolutionary', 'population', 'selection', 'mutation', 'generation', 'search'],
  },
];
