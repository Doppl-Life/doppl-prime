import { DEFAULT_PRIOR_ART_CORPUS } from '../../config/prior-art-corpus.config';

/**
 * Curated prior-art / signals corpus lookup (P2.7, ARCHITECTURE.md §6 demo-safety, KEY SAFETY RULE #7).
 *
 * The rehearsed fallback grounding for the retrieval adapter. `searchCuratedCorpus` is a PURE function
 * over the static corpus passed in — no IO, clock, or randomness (lesson §4) — so it is deterministic
 * and replay-safe: once the caller persists the result into the originating event, grounding resolves
 * from Postgres with zero web calls (rule #7).
 */

/** The two grounding kinds a retrieval result is tagged with (the §7 prior-art vs zeitgeist split). */
export type RetrievalKind = 'prior_art' | 'signal';

/** One operator-curated corpus entry. Carries NO secrets (public prior-art / signal material). */
export interface CuratedCorpusEntry {
  label: string;
  snippet: string;
  uri?: string;
  /** Terms this entry grounds; matched (token-exact, case-insensitive) against the query. */
  keywords: string[];
}

export type CuratedCorpus = CuratedCorpusEntry[];

/** A retrieval result item — produced by the curated lookup AND by the live-search mapper. */
export interface RetrievalResultItem {
  kind: RetrievalKind;
  label: string;
  snippet: string;
  uri?: string;
}

export interface CuratedSearchParams {
  kind: RetrievalKind;
  maxResults: number;
}

/** Load the curated corpus: the operator default, or a caller-supplied override. Pure. */
export function loadCuratedCorpus(override?: CuratedCorpus): CuratedCorpus {
  return override ?? DEFAULT_PRIOR_ART_CORPUS;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

/**
 * Pure, deterministic curated lookup: return up to `maxResults` corpus entries whose label/snippet/
 * keywords share a token with the query, in corpus order, each tagged the requested `kind`. An empty
 * query or no match returns `[]` ("no grounding found" is valid data, not a failure). No IO/clock/random.
 */
export function searchCuratedCorpus(
  corpus: CuratedCorpus,
  query: string,
  params: CuratedSearchParams,
): RetrievalResultItem[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];
  const limit = Math.max(0, params.maxResults);

  const matches = corpus.filter((entry) => {
    const haystack = new Set(
      tokenize(`${entry.label} ${entry.snippet} ${entry.keywords.join(' ')}`),
    );
    return queryTokens.some((token) => haystack.has(token));
  });

  return matches.slice(0, limit).map((entry) => {
    const item: RetrievalResultItem = {
      kind: params.kind,
      label: entry.label,
      snippet: entry.snippet,
    };
    if (entry.uri !== undefined) item.uri = entry.uri;
    return item;
  });
}
