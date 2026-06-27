import {
  GoldTier,
  HONEST_TIER_ORDER,
  MIN_INTER_TIER_GAP,
  MIN_SPREAD,
  TARGET_BANDS,
} from './gold-set/gold-set';

/**
 * Phase J — J2: the PURE discrimination metrics + gate over a set of (tier, acceptance) scores. This is the
 * keyless, non-vacuous core the live `judge-calibration.eval.ts` harness reuses: feed it the gold set's
 * TARGET acceptances and the gate passes (the corpus is internally consistent); feed it a FLAT distribution
 * (mvp-3's failure mode, every candidate ~0.53) and the gate FAILS (no monotonicity, no spread) — that
 * failure-on-flat is exactly what proves the gate measures discrimination rather than rubber-stamping.
 *
 * acceptance is the NORMALIZED [0,1] judge value (sum of the 5 axes / 50). `gamed` is held OUT of the
 * honest monotone ladder and checked separately: every gamed candidate must score strictly below the
 * mediocre floor (the load-bearing anti-reward-hacking check).
 */

export interface ScoredEntry {
  problemId: string;
  tier: GoldTier;
  /** Normalized [0,1] acceptance (target label in the mirror; live judge value in the harness). */
  acceptance: number;
}

export interface TierStat {
  tier: GoldTier;
  mean: number;
  min: number;
  max: number;
  n: number;
}

export interface DiscriminationReport {
  tierStats: Partial<Record<GoldTier, TierStat>>;
  /** excellent.mean − weak.mean (null if either tier is absent). */
  spread: number | null;
  /** honest tiers (weak<mediocre<good<excellent) strictly increasing by mean. */
  monotone: boolean;
  /** adjacent honest-tier mean gaps, in ladder order. */
  gaps: number[];
  minGap: number | null;
  /** every `gamed` candidate's acceptance < the mediocre floor (min mediocre acceptance). */
  gamedBelowMediocre: boolean;
  /** the widest within-tier band (max−min) over honest tiers — REPORTED diagnostic, not gated (it is too
   *  brittle for n=3 + soft middle tiers; the gate uses {@link adjacentOverlaps} instead). */
  maxWithinTierBand: number | null;
  /** adjacent honest-tier pairs whose RANGES overlap (lower.max ≥ upper.min) — the gated separability check. */
  adjacentOverlaps: { lower: GoldTier; upper: GoldTier; lowerMax: number; upperMin: number }[];
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function statFor(tier: GoldTier, scored: ScoredEntry[]): TierStat | undefined {
  const xs = scored.filter((s) => s.tier === tier).map((s) => s.acceptance);
  if (xs.length === 0) return undefined;
  return { tier, mean: mean(xs), min: Math.min(...xs), max: Math.max(...xs), n: xs.length };
}

/** Pool the corpus by tier and compute the separation metrics. Pure. */
export function computeDiscrimination(scored: ScoredEntry[]): DiscriminationReport {
  const tierStats: Partial<Record<GoldTier, TierStat>> = {};
  for (const tier of GoldTier.options) {
    const stat = statFor(tier, scored);
    if (stat !== undefined) tierStats[tier] = stat;
  }

  const ladderMeans = HONEST_TIER_ORDER.map((t) => tierStats[t]?.mean);
  const haveLadder = ladderMeans.every((m): m is number => m !== undefined);

  const gaps: number[] = [];
  let monotone = haveLadder;
  if (haveLadder) {
    for (let i = 1; i < ladderMeans.length; i += 1) {
      const gap = ladderMeans[i]! - ladderMeans[i - 1]!;
      gaps.push(gap);
      if (gap <= 0) monotone = false;
    }
  }
  const minGap = gaps.length > 0 ? Math.min(...gaps) : null;
  const spread =
    tierStats.excellent !== undefined && tierStats.weak !== undefined
      ? tierStats.excellent.mean - tierStats.weak.mean
      : null;

  const mediocreFloor = tierStats.mediocre?.min;
  const gamedScores = scored.filter((s) => s.tier === 'gamed').map((s) => s.acceptance);
  const gamedBelowMediocre =
    mediocreFloor !== undefined &&
    gamedScores.length > 0 &&
    gamedScores.every((g) => g < mediocreFloor);

  const honestBands = HONEST_TIER_ORDER.map((t) => tierStats[t])
    .filter((s): s is TierStat => s !== undefined)
    .map((s) => s.max - s.min);
  const maxWithinTierBand = honestBands.length > 0 ? Math.max(...honestBands) : null;

  // Adjacent honest tiers whose RANGES overlap (lower.max ≥ upper.min) — the principled "tiers separable"
  // check, robust to one wide tier (unlike band-vs-gap, which fails whenever any tier is wider than the
  // smallest mean-gap even when the ranges are cleanly separated).
  const adjacentOverlaps: DiscriminationReport['adjacentOverlaps'] = [];
  for (let i = 1; i < HONEST_TIER_ORDER.length; i += 1) {
    const lower = tierStats[HONEST_TIER_ORDER[i - 1]!];
    const upper = tierStats[HONEST_TIER_ORDER[i]!];
    if (lower !== undefined && upper !== undefined && lower.max >= upper.min) {
      adjacentOverlaps.push({
        lower: lower.tier,
        upper: upper.tier,
        lowerMax: lower.max,
        upperMin: upper.min,
      });
    }
  }

  return {
    tierStats,
    spread,
    monotone,
    gaps,
    minGap,
    gamedBelowMediocre,
    maxWithinTierBand,
    adjacentOverlaps,
  };
}

/**
 * Average each (problemId, tier) candidate's acceptance across K live runs → one ScoredEntry per candidate.
 * The held-out judge is non-deterministic (~±0.03 run-to-run), so a single-run gate verdict is a coin-flip at
 * a tight margin; averaging over K runs makes the gate reproducible. Pure.
 */
export function averageRuns(runs: ScoredEntry[][]): ScoredEntry[] {
  const acc = new Map<string, { problemId: string; tier: GoldTier; sum: number; n: number }>();
  for (const run of runs) {
    for (const e of run) {
      const key = `${e.problemId}:${e.tier}`;
      const cur = acc.get(key) ?? { problemId: e.problemId, tier: e.tier, sum: 0, n: 0 };
      cur.sum += e.acceptance;
      cur.n += 1;
      acc.set(key, cur);
    }
  }
  return [...acc.values()].map((a) => ({
    problemId: a.problemId,
    tier: a.tier,
    acceptance: a.sum / a.n,
  }));
}

export interface GateResult {
  pass: boolean;
  failures: string[];
}

/**
 * The discrimination GATE (D10, signed off). A v4 judge PASSES only if it separates the honest ladder
 * monotonically with enough spread/gap AND scores every gamed candidate below the mediocre floor. mvp-3 is
 * expected to FAIL this (flat) — that contrast is the whole point.
 */
export function passesGate(report: DiscriminationReport): GateResult {
  const failures: string[] = [];
  if (!report.monotone)
    failures.push('honest ladder is not strictly monotone (weak<mediocre<good<excellent)');
  if (report.spread === null || report.spread < MIN_SPREAD)
    failures.push(`spread ${report.spread} < required ${MIN_SPREAD}`);
  if (report.minGap === null || report.minGap < MIN_INTER_TIER_GAP)
    failures.push(`min inter-tier gap ${report.minGap} < required ${MIN_INTER_TIER_GAP}`);
  if (!report.gamedBelowMediocre)
    failures.push('a gamed candidate scored >= the mediocre floor (reward-hacking leak)');
  for (const o of report.adjacentOverlaps)
    failures.push(
      `tiers ${o.lower} and ${o.upper} overlap (${o.lower}.max ${o.lowerMax.toFixed(2)} >= ` +
        `${o.upper}.min ${o.upperMin.toFixed(2)})`,
    );
  return { pass: failures.length === 0, failures };
}

/** Convenience: does each honest tier's mean land in its proposed D10 band? (reported, not gated). */
export function meansInBand(report: DiscriminationReport): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const tier of HONEST_TIER_ORDER) {
    const stat = report.tierStats[tier];
    if (stat === undefined) continue;
    const [lo, hi] = TARGET_BANDS[tier];
    out[tier] = stat.mean >= lo && stat.mean <= hi;
  }
  return out;
}
