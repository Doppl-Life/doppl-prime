import { CURRENT_SCHEMA_VERSION, FitnessScore } from '@doppl/contracts';
import type { CheckResult, RunEventEnvelope, ScoringPolicy } from '@doppl/contracts';
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
 * The scorer COMPOSES already-persisted/computed component values — it does not re-derive them from
 * providers (there is no gateway in `deps`), so `total` is a pure deterministic function of `components`
 * + `policy.weights`, recomputable on replay with no model/embedding call (rule #7). It binds
 * `policyVersion = policy.version` (rule #6 — the score is forever tied to its exact immutable policy).
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

export async function scoreFitness(
  input: ScoreFitnessInput,
  policy: ScoringPolicy,
  deps: ScoreFitnessDeps,
): Promise<FitnessScore> {
  const { runId, generationId, candidateId } = input;

  // Assemble the five decomposed component entries (value + optional estimated/absent flag).
  const entries: Record<string, ComponentEntry> = {
    [NOVELTY_KEY]: noveltyEntry(input.novelty),
    [ENERGY_EFFICIENCY_KEY]: { value: input.energyEfficiency.value },
    [CRITIC_SCORES_KEY]:
      input.criticScores.contributingReviewCount === 0
        ? { value: input.criticScores.value, flag: 'absent (no contributing reviews)' }
        : { value: input.criticScores.value },
    [SUBTYPE_CHECK_KEY]: deriveSubtypeCheck(input.checkResults),
    [JUDGE_ACCEPTANCE_KEY]: input.judgeAcceptance.present
      ? { value: input.judgeAcceptance.value }
      : { value: input.judgeAcceptance.value, flag: 'absent (not accepted by default)' },
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

  // Pure weighted sum under the immutable policy (rule #6/#7).
  const { total, contributions } = applyScoringPolicy(components, policy);

  const explanation = buildExplanation(total, policy, contributions, entries);

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
 * buildExplanation — enumerates every component's raw value · weight · weighted contribution + any
 * estimated/absent flag, so the total is reconstructable from the prose alone (§8 explainability).
 */
function buildExplanation(
  total: number,
  policy: ScoringPolicy,
  contributions: Record<string, { value: number; weight: number; contribution: number }>,
  entries: Record<string, ComponentEntry>,
): string {
  const parts = Object.keys(entries).map((key) => {
    const c = contributions[key] ?? { value: entries[key]?.value ?? 0, weight: 0, contribution: 0 };
    const flag = entries[key]?.flag;
    const flagNote = flag === undefined ? '' : ` [${flag}]`;
    return `${key}: value ${c.value} × weight ${c.weight} = ${c.contribution}${flagNote}`;
  });
  return `FitnessScore total ${total} under policy ${policy.version} = ${parts.join('; ')}.`;
}
