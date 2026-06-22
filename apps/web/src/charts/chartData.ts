import { FitnessScore, NoveltyScore } from '../data/contracts';
import type { RunEventEnvelope } from '../data/contracts';

/**
 * chartData — the PURE event-derived chart-series selectors (the TDD'd core of the §12 charts). The
 * lean P7.2 run-store `ViewState` tracks per-entity STATUS, not score VALUES, so the charts derive
 * their series from the `fitness.scored` / `novelty.scored` EVENTS. Each payload is validated through
 * the FROZEN `FitnessScore` / `NoveltyScore` and its `total` / `score` is read VERBATIM — the dashboard
 * NEVER recomputes a score (scoring is authoritative, §8 / rule #6-adjacent). Generations are ordered
 * by FIRST-SEEN `sequence` (the sole ordering key — opaque-id-safe + replay-equivalent), NOT by a
 * generationId string sort. A score event without a `generationId` (no axis bucket) or with a payload
 * that fails the frozen schema is skipped defensively, never crashing the series.
 */

export interface FitnessSeriesPoint {
  readonly generationId: string;
  /** 0-based order by first-seen sequence. */
  readonly index: number;
  /** The generation's peak FitnessScore.total (verbatim). */
  readonly best: number;
  readonly mean: number;
  readonly count: number;
  /** The best candidate's FitnessScore.components (for the components overlay). */
  readonly components?: Readonly<Record<string, number>> | undefined;
}

export interface GenerationComparisonPoint {
  readonly generationId: string;
  readonly index: number;
  readonly bestFitness: number;
  readonly meanFitness: number;
  readonly fitnessCount: number;
  readonly bestNovelty: number;
  readonly meanNovelty: number;
  readonly noveltyCount: number;
}

interface ScoredFitness {
  generationId: string;
  sequence: number;
  total: number;
  components: Record<string, number>;
}
interface ScoredNovelty {
  generationId: string;
  sequence: number;
  score: number;
}

/** Parse the validated `fitness.scored` events that carry a generation bucket (verbatim total). */
function collectFitness(events: readonly RunEventEnvelope[]): ScoredFitness[] {
  const out: ScoredFitness[] = [];
  for (const e of events) {
    if (e.type !== 'fitness.scored' || e.generationId === undefined) continue;
    const parsed = FitnessScore.safeParse(e.payload);
    if (!parsed.success) continue; // skip a malformed payload defensively
    out.push({
      generationId: e.generationId,
      sequence: e.sequence,
      total: parsed.data.total,
      components: parsed.data.components,
    });
  }
  return out;
}

/** Parse the validated `novelty.scored` events that carry a generation bucket (verbatim score). */
function collectNovelty(events: readonly RunEventEnvelope[]): ScoredNovelty[] {
  const out: ScoredNovelty[] = [];
  for (const e of events) {
    if (e.type !== 'novelty.scored' || e.generationId === undefined) continue;
    const parsed = NoveltyScore.safeParse(e.payload);
    if (!parsed.success) continue;
    out.push({ generationId: e.generationId, sequence: e.sequence, score: parsed.data.score });
  }
  return out;
}

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;

/** Generation ids ordered by their first-seen sequence across the given (generationId, sequence) rows. */
function generationOrder(
  rows: ReadonlyArray<{ generationId: string; sequence: number }>,
): string[] {
  const firstSeq = new Map<string, number>();
  for (const r of rows) {
    const prev = firstSeq.get(r.generationId);
    if (prev === undefined || r.sequence < prev) firstSeq.set(r.generationId, r.sequence);
  }
  return [...firstSeq.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

export function deriveFitnessSeries(events: readonly RunEventEnvelope[]): FitnessSeriesPoint[] {
  const fits = collectFitness(events);
  const order = generationOrder(fits);
  return order.map((generationId, index) => {
    const rows = fits.filter((f) => f.generationId === generationId);
    const totals = rows.map((r) => r.total);
    const best = rows.reduce((b, r) => (r.total > b.total ? r : b), rows[0]!);
    return {
      generationId,
      index,
      best: best.total,
      mean: mean(totals),
      count: totals.length,
      components: best.components,
    };
  });
}

export function deriveGenerationComparison(
  events: readonly RunEventEnvelope[],
): GenerationComparisonPoint[] {
  const fits = collectFitness(events);
  const novs = collectNovelty(events);
  const order = generationOrder([...fits, ...novs]);
  return order.map((generationId, index) => {
    const ft = fits.filter((f) => f.generationId === generationId).map((f) => f.total);
    const nv = novs.filter((n) => n.generationId === generationId).map((n) => n.score);
    return {
      generationId,
      index,
      bestFitness: ft.length ? Math.max(...ft) : 0,
      meanFitness: mean(ft),
      fitnessCount: ft.length,
      bestNovelty: nv.length ? Math.max(...nv) : 0,
      meanNovelty: mean(nv),
      noveltyCount: nv.length,
    };
  });
}
