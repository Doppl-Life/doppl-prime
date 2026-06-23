import type { CaseStudySubtype } from '../src/contracts/index.ts';

export type DiscoverySubtype = CaseStudySubtype | 'neither';
export type SourceTier = 'free' | 'curl_cffi' | 'firecrawl' | 'browser' | 'dispatch' | 'unknown';
export type SourceRecipeStatus = 'working' | 'broken' | 'untested' | 'unknown';
export type SourceOutcomeStatus = 'productive' | 'marginal' | 'polluting' | 'looks_good_but_isnt' | 'unproven' | 'unreachable';
export type ResolvedOutcome = 'true' | 'false' | 'unknown';

export type SourceRecipe = {
  source: string;
  tier: SourceTier;
  method: string;
  triedAndFailed: string[];
  connectorCandidate?: string;
  notes: string;
  status: SourceRecipeStatus;
};

export type SourceOutcome = {
  source: string;
  lens: string;
  volume: number;
  hits: number;
  traps: number;
  cumulativeScore: number;
  hitRate: number;
  trapRate: number;
  avgScore: number | null;
  status: SourceOutcomeStatus;
  lastError?: string;
  observedAt: string;
};

export type DiscoveryLens = {
  id: string;
  prompt: string;
  positiveRubric: string;
  negativeRubric: string;
};

export type ResolvedBenchmark = {
  title: string;
  lensScore: number;
  prediction: string;
  outcome: ResolvedOutcome;
  note: string;
};

export type CalibrationBand = {
  n: number;
  resolved: number;
  cameTrue: number;
  hitRate: number | null;
};

export const discoveryScoreThresholds = {
  hit: 3,
  trap: -3,
  minVolumeToJudge: 3,
  expireFloor: 1,
  expireMinAgeDays: 21,
  refreshMinRaw: 4,
  refreshDrop: 1,
} as const;

export const discoveryHalfLifeDays: Record<DiscoverySubtype, number> = {
  zeitgeist_synthesis: 14,
  cross_domain_transfer: 3650,
  neither: 60,
};

export const discoveryLenses: DiscoveryLens[] = [
  {
    id: 'capstone-demo-fit',
    prompt: "Can a 3-4 person team show something live in two weeks that makes a room go 'oh'?",
    positiveRubric: '+5 is rare and needs a concrete live-demo moment; +3 is solid and demoable; +1 is mildly useful.',
    negativeRubric: '-3 or lower is a distractor, Goodhart trap, misframed problem, or tarpit that would cost the team.',
  },
  {
    id: 'arbitrage',
    prompt: 'Is there a mispriced belief here where verification cost is far below discovery cost?',
    positiveRubric: '+5 has dated resolution and asymmetric payoff; +3 is partly priced but plausible.',
    negativeRubric: '-3 or lower is a seductive false edge, unfalsifiable thesis, or value trap.',
  },
  {
    id: 'build-moat',
    prompt: 'Is this defensible, or did an exogenous shift make a latent asset load-bearing?',
    positiveRubric: '+5 is a durable moat or latent capability unlocked by the world changing.',
    negativeRubric: '-3 or lower is a commodity dressed as a moat or a structurally doomed position.',
  },
];

export const sourceRecipes: SourceRecipe[] = [
  {
    source: 'hackernews',
    tier: 'free',
    method: 'Algolia API: GET https://hn.algolia.com/api/v1/search?tags=front_page',
    triedAndFailed: ['numericFilters=points>150 returned 400 because points is not filterable'],
    notes: 'Clean JSON, no auth, reliable baseline.',
    status: 'working',
  },
  {
    source: 'lobsters',
    tier: 'free',
    method: 'GET https://lobste.rs/hottest.json',
    triedAndFailed: [],
    notes: 'JSON, no auth. Higher signal-to-noise than HN.',
    status: 'working',
  },
  {
    source: 'arxiv',
    tier: 'free',
    method: 'GET https://export.arxiv.org/api/query and parse Atom entries',
    triedAndFailed: ['http endpoint returned empty or non-200; use https'],
    notes: 'Must use https. Atom XML is enough for title and summary.',
    status: 'working',
  },
  {
    source: 'github-trending',
    tier: 'free',
    method: 'GitHub Search API: /search/repositories?q=created:>DATE&sort=stars',
    triedAndFailed: [],
    connectorCandidate: 'GitHub connector would lift rate limits and add richer metadata.',
    notes: 'Unauthed search is rate-limited. Good transfer signal from what builders are starring now.',
    status: 'working',
  },
  {
    source: 'yc-rfs',
    tier: 'free',
    method: 'Curated YC RFS fixture; refresh per YC batch rather than per run.',
    triedAndFailed: [],
    notes: 'Static-ish high-value source for buildable problems.',
    status: 'working',
  },
  {
    source: 'producthunt',
    tier: 'free',
    method: 'RSS: GET https://www.producthunt.com/feed and parse items',
    triedAndFailed: [],
    connectorCandidate: 'Product Hunt API needs OAuth; a connector would simplify auth.',
    notes: 'RSS is shallow; official API gives votes and topics.',
    status: 'working',
  },
  {
    source: 'reddit',
    tier: 'curl_cffi',
    method: 'Try Chrome-impersonating GET before browser; fall through if IP or auth blocks.',
    triedAndFailed: ['plain GET returned 403', 'custom User-Agent returned 403', 'datacenter IP still returned 403'],
    connectorCandidate: 'Reddit OAuth or browser connector.',
    notes: 'High raw-problem signal, but access is the cost. Do not treat plain scraping as reliable.',
    status: 'broken',
  },
  {
    source: 'x',
    tier: 'dispatch',
    method: 'dispatch:grok-cli or an X/Twitter connector; native live-firehose beats scraping.',
    triedAndFailed: [],
    connectorCandidate: 'Grok/X connector or browser-use.',
    notes: 'Highest-value zeitgeist source, but flakiest if treated as scraping.',
    status: 'untested',
  },
  {
    source: 'youtube',
    tier: 'dispatch',
    method: 'Data API for trend signal; dispatch:gemini-cli for transcript digestion.',
    triedAndFailed: ['no YouTube API key during source-radar run'],
    connectorCandidate: 'Gemini CLI or YouTube Data API.',
    notes: 'Use Google-native transcript/search access when possible.',
    status: 'broken',
  },
  {
    source: 'google-trends',
    tier: 'free',
    method: 'Unofficial trends endpoint or pytrends for daily/realtime breakouts.',
    triedAndFailed: ['dailytrends endpoint returned 404 during source-radar run'],
    notes: 'Pure why-now instrument, but unofficial and fragile.',
    status: 'broken',
  },
  {
    source: 'sec-edgar',
    tier: 'free',
    method: 'EDGAR full-text search API: https://efts.sec.gov/LATEST/search-index',
    triedAndFailed: [],
    notes: 'Latent-asset unlocks can appear in filing language before repricing.',
    status: 'working',
  },
  {
    source: 'papers-with-code',
    tier: 'free',
    method: 'GET https://paperswithcode.com/api/v1/ for trending papers plus code.',
    triedAndFailed: [],
    notes: 'Frontier research crossing into buildable transfer signal.',
    status: 'untested',
  },
];

export const observedSourceOutcomes: SourceOutcome[] = [
  { source: 'corpus:case-studies', lens: 'capstone-demo-fit', volume: 5, hits: 5, traps: 0, cumulativeScore: 18, hitRate: 1, trapRate: 0, avgScore: 3.6, status: 'productive', observedAt: '2026-06-20' },
  { source: 'yc-rfs', lens: 'capstone-demo-fit', volume: 90, hits: 90, traps: 0, cumulativeScore: 305, hitRate: 1, trapRate: 0, avgScore: 3.39, status: 'productive', observedAt: '2026-06-21' },
  { source: 'hackernews', lens: 'capstone-demo-fit', volume: 97, hits: 69, traps: 0, cumulativeScore: 252, hitRate: 0.711, trapRate: 0, avgScore: 2.6, status: 'productive', observedAt: '2026-06-21' },
  { source: 'lobsters', lens: 'capstone-demo-fit', volume: 108, hits: 49, traps: 0, cumulativeScore: 248, hitRate: 0.454, trapRate: 0, avgScore: 2.3, status: 'productive', observedAt: '2026-06-21' },
  { source: 'github-trending', lens: 'capstone-demo-fit', volume: 108, hits: 90, traps: 0, cumulativeScore: 292, hitRate: 0.833, trapRate: 0, avgScore: 2.7, status: 'productive', observedAt: '2026-06-21' },
  { source: 'arxiv', lens: 'capstone-demo-fit', volume: 90, hits: 90, traps: 0, cumulativeScore: 286, hitRate: 1, trapRate: 0, avgScore: 3.18, status: 'productive', observedAt: '2026-06-21' },
  { source: 'sec-edgar', lens: 'capstone-demo-fit', volume: 90, hits: 49, traps: 0, cumulativeScore: 229, hitRate: 0.544, trapRate: 0, avgScore: 2.54, status: 'productive', observedAt: '2026-06-21' },
  { source: 'producthunt', lens: 'capstone-demo-fit', volume: 36, hits: 36, traps: 0, cumulativeScore: 109, hitRate: 1, trapRate: 0, avgScore: 3.03, status: 'productive', observedAt: '2026-06-21' },
  { source: 'google-trends', lens: '*', volume: 0, hits: 0, traps: 0, cumulativeScore: 0, hitRate: 0, trapRate: 0, avgScore: null, status: 'unreachable', lastError: 'Unofficial dailytrends endpoint returned 404.', observedAt: '2026-06-21' },
  { source: 'youtube', lens: '*', volume: 0, hits: 0, traps: 0, cumulativeScore: 0, hitRate: 0, trapRate: 0, avgScore: null, status: 'unreachable', lastError: 'No YouTube API key; dispatch route recommended.', observedAt: '2026-06-21' },
  { source: 'reddit:startups', lens: '*', volume: 0, hits: 0, traps: 0, cumulativeScore: 0, hitRate: 0, trapRate: 0, avgScore: null, status: 'unreachable', lastError: 'Reddit returned 403 to plain JSON request.', observedAt: '2026-06-21' },
];

export const resolvedBenchmarks: ResolvedBenchmark[] = [
  {
    title: "AI's binding constraint is firm power, not chips",
    lensScore: 5,
    prediction: 'Firm-generation holders re-rate as AI data-center load growth makes dispatchable power the binding input by 2026.',
    outcome: 'true',
    note: 'Power/grid constraint became consensus through 2025-2026; firm-generation names re-rated.',
  },
  {
    title: "NVIDIA's gaming GPUs were a latent parallel-compute asset",
    lensScore: 5,
    prediction: 'A parallel-compute asset built for graphics becomes the binding input for AI; the holder re-rates massively.',
    outcome: 'true',
    note: 'Canonical latent-asset unlock; resolved emphatically.',
  },
  {
    title: 'GLP-1 as correlated demand destruction across impulse categories',
    lensScore: 4,
    prediction: 'By end of 2027 a top-5 snack maker reports volume decline it attributes to GLP-1; effect generalizes beyond food.',
    outcome: 'unknown',
    note: 'Still resolving; behavioral knock-on evidence is early.',
  },
  {
    title: 'AI Overviews invert publisher distribution',
    lensScore: 4,
    prediction: 'Answer engines cross a query-share threshold and referral traffic to publishers structurally declines.',
    outcome: 'true',
    note: 'Zero-click / answer-engine shift materialized through 2025-2026.',
  },
  {
    title: 'C2PA provenance solves synthetic-media authenticity',
    lensScore: 2,
    prediction: 'C2PA content credentials become the trusted authenticity layer adopted at scale.',
    outcome: 'false',
    note: 'Deliberately low score on an over-hyped thesis; security analyses found it oversold.',
  },
  {
    title: 'Crocs/UGG resurgence as durable forward consumer thesis',
    lensScore: 1,
    prediction: 'Ugly-comfort footwear sustains as a forward, investable secular trend.',
    outcome: 'false',
    note: 'Borderline post-hoc narrative with no falsifiable forward signal.',
  },
];

export function decayFactor(subtype: DiscoverySubtype, ageDays: number): number {
  return 0.5 ** (Math.max(0, ageDays) / discoveryHalfLifeDays[subtype]);
}

export function ageDays(observedAt: string, now = new Date()): number {
  const parsed = Date.parse(observedAt);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, (now.getTime() - parsed) / 86_400_000);
}

export function effectiveDiscoveryScore(
  lensScore: number,
  subtype: DiscoverySubtype,
  observedAt: string,
  now = new Date(),
): number {
  return Number((lensScore * decayFactor(subtype, ageDays(observedAt, now))).toFixed(2));
}

export function shouldExpireDiscoveryCandidate(
  candidate: { subtype: DiscoverySubtype; lensScore: number; observedAt: string; status?: string },
  now = new Date(),
): boolean {
  if (candidate.subtype !== 'zeitgeist_synthesis' || candidate.status === 'promoted') return false;
  const age = ageDays(candidate.observedAt, now);
  if (age < discoveryScoreThresholds.expireMinAgeDays) return false;
  return effectiveDiscoveryScore(candidate.lensScore, candidate.subtype, candidate.observedAt, now) < discoveryScoreThresholds.expireFloor;
}

export function sourceStatusFor(input: {
  volume: number;
  hits: number;
  traps: number;
  lastError?: string;
}): SourceOutcomeStatus {
  if (input.lastError && input.volume === 0) return 'unreachable';
  if (input.volume < discoveryScoreThresholds.minVolumeToJudge) return 'unproven';
  if (input.traps > input.hits) return 'polluting';
  if (input.hits / input.volume >= 0.4) return 'productive';
  if (input.hits === 0 && input.traps === 0) return 'looks_good_but_isnt';
  return 'marginal';
}

export function connectorBacklog(
  recipes: SourceRecipe[] = sourceRecipes,
  outcomes: SourceOutcome[] = observedSourceOutcomes,
): SourceRecipe[] {
  const productiveSources = new Set(
    outcomes
      .filter((outcome) => outcome.status === 'productive')
      .map((outcome) => outcome.source.split(':')[0]),
  );
  return recipes
    .filter((recipe) => recipe.connectorCandidate)
    .filter((recipe) => recipe.tier === 'browser' || recipe.tier === 'dispatch' || recipe.status === 'broken' || productiveSources.has(recipe.source))
    .sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || a.source.localeCompare(b.source));
}

export function benchmarkCalibration(benchmarks: ResolvedBenchmark[] = resolvedBenchmarks): {
  bands: Record<'+4..+5' | '+1..+3' | '<=0', CalibrationBand>;
  calibrated: boolean | null;
} {
  const bands = {
    '+4..+5': bucket(benchmarks.filter((item) => item.lensScore >= 4)),
    '+1..+3': bucket(benchmarks.filter((item) => item.lensScore >= 1 && item.lensScore <= 3)),
    '<=0': bucket(benchmarks.filter((item) => item.lensScore <= 0)),
  };
  const high = bands['+4..+5'].hitRate;
  const low = bands['+1..+3'].hitRate;
  return { bands, calibrated: high === null || low === null ? null : high > low };
}

export function sourceRadarSummary(): {
  sourceCount: number;
  workingSources: number;
  brokenSources: number;
  connectorBacklog: string[];
  benchmarkCalibration: ReturnType<typeof benchmarkCalibration>;
} {
  return {
    sourceCount: sourceRecipes.length,
    workingSources: sourceRecipes.filter((recipe) => recipe.status === 'working').length,
    brokenSources: sourceRecipes.filter((recipe) => recipe.status === 'broken').length,
    connectorBacklog: connectorBacklog().map((recipe) => recipe.source),
    benchmarkCalibration: benchmarkCalibration(),
  };
}

function tierRank(tier: SourceTier): number {
  return { browser: 0, dispatch: 1, curl_cffi: 2, firecrawl: 3, free: 4, unknown: 5 }[tier];
}

function bucket(items: ResolvedBenchmark[]): CalibrationBand {
  const resolved = items.filter((item) => item.outcome === 'true' || item.outcome === 'false');
  const cameTrue = resolved.filter((item) => item.outcome === 'true').length;
  return {
    n: items.length,
    resolved: resolved.length,
    cameTrue,
    hitRate: resolved.length ? Number((cameTrue / resolved.length).toFixed(2)) : null,
  };
}
