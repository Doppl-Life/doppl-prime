import { CURRENT_SCHEMA_VERSION, FitnessScore } from '@doppl/contracts';
import type { CheckResult, RunEventEnvelope, ScoringPolicy } from '@doppl/contracts';
import { CRITIC_SCORE_MAX } from '../components/critic-scores';
import type { CriticScoresResult } from '../components/critic-scores';
import type { EnergyEfficiencyResult } from '../components/energy-efficiency';
import type { JudgeAcceptanceResult } from '../components/judge-acceptance';
import type { ScoreNoveltyResult } from '../novelty/score-novelty';
import {
  CRITIC_SCORES_KEY,
  ENERGY_EFFICIENCY_KEY,
  JUDGE_ACCEPTANCE_KEY,
  NOVELTY_KEY,
  SUBTYPE_CHECK_KEY,
  applyScoringPolicy,
} from './policy';

/**
 * scoreFitness (P5.6, ARCHITECTURE.md §8) — the scoring capstone. Composes the five already-computed
 * decomposed component RESULTS into a single frozen `FitnessScore` via the immutable `ScoringPolicy`
 * weights, then emits one authoritative `fitness.scored`.
 *
 * NORMALIZED weighted AVERAGE (the scale fix): every component is brought onto a common [0,1] scale BEFORE
 * weighting — novelty / energy_efficiency / subtype_check are already 0–1; the held-out-judge acceptance is
 * RAW 0–`judgeAcceptance.maxValue` (5 axes × 0–5 = 0–25 for the MVP rubric) and the critic-council value is
 * an unbounded raw magnitude, so both are divided by their max (`÷ maxValue`, `÷ CRITIC_SCORE_MAX`) and
 * clamped to [0,1]. `total` is then the weight-normalized average `Σ weightₖ·normₖ / Σ weightₖ` ∈ [0,1]
 * (the DS 0–1 convention), so no single raw-scale component can dominate (rule #6 — the held-out judge must
 * be a real, comparably-weighted anchor, not decorative). The `components` record persists the NORMALIZED
 * values (the actually-weighted signals), so the total is reconstructable from the persisted score.
 *
 * The scorer COMPOSES already-persisted/computed component values — it does not re-derive them from
 * providers (there is no gateway in `deps`), so `total` is a pure deterministic function of `components`
 * + `policy.weights`, recomputable on replay with no model/embedding call (rule #7). It binds
 * `policyVersion = policy.version` (rule #6 — the score is forever tied to its exact immutable policy).
 * The judge's acceptance is read VERBATIM upstream (`judgeAcceptance.value`, rule #6) — the scorer only
 * RESCALES the derived fitness component for the average, never recomputes the judge's measurement.
 * Novelty is REFERENCED via `components.novelty` (the consumed value), never re-stored — `novelty.scored`
 * stays the authoritative novelty home (LESSONS §13). Absent/degraded components contribute a defined
 * value (0 for absent — never inflating fitness) and are FLAGGED in the explanation, never silent-scored.
 */
export type FitnessEmitter = (
  envelope: Omit<RunEventEnvelope, 'sequence' | 'occurredAt'>,
) => Promise<{ sequence: number }>;

export interface ScoreFitnessInput {
  runId: string;
  generationId?: string;
  candidateId: string;
  /** Pre-computed novelty result (P5.2/P5.3) — the consumed value, not re-derived here. */
  novelty: ScoreNoveltyResult;
  energyEfficiency: EnergyEfficiencyResult;
  criticScores: CriticScoresResult;
  judgeAcceptance: JudgeAcceptanceResult;
  /** Raw subtype CheckResult[] — P5.6 derives the subtype_check component itself. */
  checkResults: readonly CheckResult[];
}

export interface ScoreFitnessDeps {
  emit: FitnessEmitter;
  /** Injected id factory — keeps the scorer free of `Math.random`/uuid (byte-deterministic, §24). */
  newId: () => string;
}

/** A component's value + whether it is a real measurement or an estimated/absent fallback (flagged). */
interface ComponentEntry {
  value: number;
  flag?: string;
}

/**
 * deriveSubtypeCheck — `passed / (passed + failed)` over NON-skipped checks (a skip is "no signal," not
 * a fail). No non-skipped checks → a defined boundary 0, flagged absent (never a silent pass).
 */
function deriveSubtypeCheck(checkResults: readonly CheckResult[]): ComponentEntry {
  let passed = 0;
  let failed = 0;
  for (const check of checkResults) {
    if (check.status === 'passed') passed += 1;
    else if (check.status === 'failed') failed += 1;
  }
  const total = passed + failed;
  if (total === 0) {
    return { value: 0, flag: 'absent (no non-skipped checks)' };
  }
  return { value: passed / total };
}

function noveltyEntry(novelty: ScoreNoveltyResult): ComponentEntry {
  if (novelty.degraded) {
    return { value: novelty.estimatedScore, flag: `estimated (${novelty.method})` };
  }
  return { value: novelty.noveltyScore.score };
}

/**
 * clampUnit — clamp a value to [0,1]. A normalized component slightly over 1 (a critic that emitted a raw
 * score above the assumed max, or floating-point drift) is pinned to 1 rather than allowed to inflate the
 * average past the DS 0–1 convention; a negative value is pinned to 0. A non-finite input is left for the
 * downstream finite-integrity guard to coerce + flag (so it is still surfaced, not silently zeroed here).
 */
function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return value;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * judgeEntry — normalize the held-out-judge acceptance onto [0,1] for the weighted average. `value` is the
 * acceptance read VERBATIM upstream (rule #6); the scorer divides by `maxValue` (the rubric's max acceptance)
 * so a raw 0–25 metric does not dominate the 0–1 components — the CRITICAL scale fix. A non-positive
 * `maxValue` (degenerate rubric → no normalization basis) maps to a defined 0 (no judge signal), never a
 * divide-by-zero. The absent path (`present:false`, value 0) normalizes to 0 regardless of the divisor.
 */
function judgeEntry(judge: JudgeAcceptanceResult): ComponentEntry {
  const normalized = judge.maxValue > 0 ? clampUnit(judge.value / judge.maxValue) : 0;
  if (!judge.present) {
    return { value: normalized, flag: 'absent (not accepted by default)' };
  }
  return { value: normalized };
}

/**
 * criticEntry — normalize the critic-council component onto [0,1] (÷ `CRITIC_SCORE_MAX`, clamped) so a
 * critic emitting larger raw numbers cannot dominate the average. `contributingReviewCount === 0` is the
 * absence boundary (flagged), value 0.
 */
function criticEntry(critic: CriticScoresResult): ComponentEntry {
  const normalized = clampUnit(critic.value / CRITIC_SCORE_MAX);
  if (critic.contributingReviewCount === 0) {
    return { value: normalized, flag: 'absent (no contributing reviews)' };
  }
  return { value: normalized };
}

export async function scoreFitness(
  input: ScoreFitnessInput,
  policy: ScoringPolicy,
  deps: ScoreFitnessDeps,
): Promise<FitnessScore> {
  const { runId, generationId, candidateId } = input;

  // Assemble the five decomposed component entries, each on the common [0,1] scale (value + optional
  // estimated/absent flag). novelty / energy / subtype are already 0–1; judge + critic are normalized
  // (÷ their max, clamped) so no raw-scale signal dominates the weighted average (rule #6 scale fix).
  const entries: Record<string, ComponentEntry> = {
    [NOVELTY_KEY]: noveltyEntry(input.novelty),
    [ENERGY_EFFICIENCY_KEY]: { value: clampUnit(input.energyEfficiency.value) },
    [CRITIC_SCORES_KEY]: criticEntry(input.criticScores),
    [SUBTYPE_CHECK_KEY]: deriveSubtypeCheck(input.checkResults),
    [JUDGE_ACCEPTANCE_KEY]: judgeEntry(input.judgeAcceptance),
  };

  // Finite-integrity guard (rule #6/§8 defense-in-depth): a non-finite component value (NaN/Infinity
  // from a corrupt upstream result) is coerced to 0 + flagged, so it can NEVER reach `total` — a NaN
  // total silently corrupts the fitness anchor in P5.7 cull/parent-selection (NaN compares falsely).
  const components: Record<string, number> = {};
  for (const [key, entry] of Object.entries(entries)) {
    if (!Number.isFinite(entry.value)) {
      entries[key] = {
        value: 0,
        flag: entry.flag === undefined ? 'non-finite→0' : `${entry.flag}; non-finite→0`,
      };
    }
    components[key] = entries[key]!.value;
  }

  // Pure weighted sum + the recognized-weight divisor under the immutable policy (rule #6/#7).
  const { total: weightedSum, weightSum, contributions } = applyScoringPolicy(components, policy);

  // total = NORMALIZED weighted AVERAGE in [0,1] (Σ wₖ·normₖ / Σ wₖ). A zero weight-sum (no recognized
  // component weighted — e.g. an all-zero-weight policy) has no normalization basis → a DEFINED finite 0
  // (no signal moves a zero-weight policy), never a divide-by-zero NaN that would silently corrupt the
  // anchor in P5.7 cull/parent-selection. With every component already in [0,1] and weights ≥ 0, total ∈ [0,1].
  const total = weightSum > 0 ? weightedSum / weightSum : 0;

  const explanation = buildExplanation(total, policy, weightSum, contributions, entries);

  const fitnessScore = FitnessScore.parse({
    id: deps.newId(),
    candidateId,
    total,
    components,
    policyVersion: policy.version,
    explanation,
  });

  await deps.emit({
    runId,
    generationId,
    candidateId,
    id: deps.newId(),
    type: 'fitness.scored',
    actor: 'selection_controller',
    payload: fitnessScore,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

  return fitnessScore;
}

/**
 * buildExplanation — enumerates every component's NORMALIZED value · weight · weighted contribution + any
 * estimated/absent flag, plus the weight-sum divisor, so the total (a normalized weighted average) is
 * reconstructable from the prose alone (§8 explainability).
 */
function buildExplanation(
  total: number,
  policy: ScoringPolicy,
  weightSum: number,
  contributions: Record<string, { value: number; weight: number; contribution: number }>,
  entries: Record<string, ComponentEntry>,
): string {
  const parts = Object.keys(entries).map((key) => {
    const c = contributions[key] ?? { value: entries[key]?.value ?? 0, weight: 0, contribution: 0 };
    const flag = entries[key]?.flag;
    const flagNote = flag === undefined ? '' : ` [${flag}]`;
    return `${key}: value ${c.value} × weight ${c.weight} = ${c.contribution}${flagNote}`;
  });
  return (
    `FitnessScore total ${total} under policy ${policy.version} = ` +
    `(${parts.join('; ')}) / Σweights ${weightSum}.`
  );
}
