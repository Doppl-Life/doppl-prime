// Applies observer-relative lens scores after selection.
import type { LensConfig, LensResult, LensScore, ScoredCandidatePool, SelectionComparison, TraceEvent } from './contracts/index.ts';
import { clampScore, getBoundary } from './contracts/index.ts';

function scoreCandidate(lens: LensConfig, candidate: ScoredCandidatePool['candidates'][number]): LensScore {
  const demoFit = clampScore((candidate.fitness.components.mechanismClarity * 0.55) + (candidate.fitness.components.falsifiability * 0.45));
  const evidenceFit = clampScore(candidate.fitness.components.signalStrength);
  const scopeFit = clampScore(1 - Math.max(0, candidate.delta.changes.length - 2) * 0.12);
  const riskFit = clampScore(1 - candidate.fitness.components.riskPenalty);
  const score = clampScore((demoFit * 0.35) + (evidenceFit * 0.3) + (scopeFit * 0.2) + (riskFit * 0.15));

  return {
    lensId: lens.id,
    candidateId: candidate.id,
    score,
    passed: score >= 0.55,
    components: {
      demoFit,
      evidenceFit,
      scopeFit,
      riskFit,
    },
    reasons: [
      `demoFit=${demoFit}`,
      `evidenceFit=${evidenceFit}`,
      `scopeFit=${scopeFit}`,
      `riskFit=${riskFit}`,
    ],
    inputRefs: [
      { kind: 'candidate', id: candidate.id, field: 'fitness' },
      { kind: 'candidate', id: candidate.id, field: 'delta' },
    ],
  };
}

export function applyLenses(pool: ScoredCandidatePool, comparison: SelectionComparison, lenses: LensConfig[]): {
  lensResults: LensResult[];
  event: TraceEvent;
} {
  const selectedIds = new Set([
    ...comparison.focus.selected.map((candidate) => candidate.id),
    ...comparison.alternate.selected.map((candidate) => candidate.id),
  ]);
  const candidates = pool.candidates.filter((candidate) => selectedIds.has(candidate.id));
  const lensResults = lenses.map((lens) => ({
    lensId: lens.id,
    label: lens.label,
    scores: candidates.map((candidate) => scoreCandidate(lens, candidate)),
  }));

  return {
    lensResults,
    event: {
      stage: 'lens',
      input: `SelectionComparison + ${candidates.length} selected candidate(s)`,
      decision: `Applied ${lenses.length} observer-relative feasibility lens(es) after intrinsic selection.`,
      reason: 'Feasibility is observer-relative fit; it must not contaminate novelty, grounding, or decay.',
      output: `LensResult(${lensResults.map((result) => result.lensId).join(', ')})`,
      goalChecks: [
        {
          id: 'feasibility-outside-fitness',
          label: 'Feasibility is emitted as LensResult, not FitnessScore.',
          passed: lensResults.every((result) => result.scores.every((score) => Number.isFinite(score.score))) &&
            lensResults.every((result) => result.scores.length === selectedIds.size) &&
            candidates.every((candidate) => !('feasibility' in candidate.fitness)),
          detail: `${candidates.length} selected candidate(s) scored through lens layer; fitness fields stayed intrinsic.`,
        },
      ],
      boundary: getBoundary('lens'),
    },
  };
}
