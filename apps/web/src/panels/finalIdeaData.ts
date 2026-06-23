import { FitnessScore } from '../data/contracts';
import type { CandidateIdea, LineageGraphProjection, RunEventEnvelope } from '../data/contracts';
import type { RunMode } from '../state/reducer';
import { deriveReviewsByCandidate } from './criticData';
import type { CriticReviewValue } from './criticData';
import { deriveChecksByCandidate } from './checkData';
import type { CheckResultValue } from './checkData';
import { deriveEnergyByAgenome } from './energyData';
import type { AgenomeEnergyRow } from './energyData';

/**
 * finalIdeaData — the capstone aggregation (pure). `selectWinner` finds the kernel/judge-selected winner
 * (the `LineageGraphProjection` node with `type:'candidate'` + `status:'selected'`, determined by the
 * backend P6.3 — LESSONS §5). `gatherProof` aggregates the winner's defensibility evidence by REUSING the
 * P7.11 (reviews) / P7.12 (checks) / P7.9 (energy) selectors + a focused `winnerFitness` (the winner's
 * per-candidate FitnessScore — P7.8 groups per-generation, so this is a small in-file helper) + in-tier
 * trace refs.
 *
 * EMIT-ONLY (rule #6, anti-reward-hacking at the most tempting surface): the panel DISPLAYS the selected
 * winner — it NEVER re-ranks candidates or derives its own winner from scores/critiques.
 */

export type LineageNodeValue = LineageGraphProjection['nodes'][number];

/** The selected winner node, or null if the run hasn't produced one yet (graceful). */
export function selectWinner(lineage: LineageGraphProjection): LineageNodeValue | null {
  return lineage.nodes.find((n) => n.type === 'candidate' && n.status === 'selected') ?? null;
}

/**
 * The transfer-evidence rung label, derived purely from the run MODE (PD.7). ZERO new contract surface:
 * the frozen `CheckResult` carries no live/replay discriminator, so the run-wide live/replay framing IS
 * the provenance — a `live` run's allowlisted check is the live non-executing check; a `replay` run's
 * evidence is replay-backed. This is a PRESENTATION of the mode, never a re-judgement (rule #6 emit-only).
 */
export function evidenceRungLabel(mode: RunMode): string {
  return mode === 'replay' ? 'replay-backed' : 'live allowlisted (non-executing)';
}

export interface TraceRef {
  readonly eventId: string;
  readonly traceId?: string | undefined;
  readonly observationId?: string | undefined;
}

export interface WinnerProof {
  readonly winner: LineageNodeValue;
  readonly candidate: CandidateIdea;
  readonly reviews: CriticReviewValue[];
  readonly checks: CheckResultValue[];
  readonly fitnessTotal: number | null;
  readonly fitnessComponents: Readonly<Record<string, number>> | null;
  readonly energy: AgenomeEnergyRow | null;
  readonly traces: TraceRef[];
}

/** The winner's per-candidate FitnessScore (total + components) — last by sequence; null if none. */
function winnerFitness(
  events: readonly RunEventEnvelope[],
  candidateId: string,
): { total: number; components: Record<string, number> } | null {
  let found: { total: number; components: Record<string, number> } | null = null;
  for (const e of [...events].sort((a, b) => a.sequence - b.sequence)) {
    if (e.type !== 'fitness.scored') continue;
    const parsed = FitnessScore.safeParse(e.payload);
    if (!parsed.success || parsed.data.candidateId !== candidateId) continue;
    found = { total: parsed.data.total, components: parsed.data.components }; // highest-sequence wins
  }
  return found;
}

/** In-tier trace refs for the winner — langfuse ids carried on the winner's events (no external href). */
function winnerTraces(events: readonly RunEventEnvelope[], candidateId: string): TraceRef[] {
  const out: TraceRef[] = [];
  for (const e of events) {
    if (e.candidateId !== candidateId) continue;
    if (e.langfuseTraceId === undefined && e.langfuseObservationId === undefined) continue;
    out.push({ eventId: e.id, traceId: e.langfuseTraceId, observationId: e.langfuseObservationId });
  }
  return out;
}

/** Aggregate the winner's defensibility proof — reuses the P7.9/P7.11/P7.12 selectors + winner fitness/traces. */
export function gatherProof(
  winner: LineageNodeValue,
  candidate: CandidateIdea,
  events: readonly RunEventEnvelope[],
): WinnerProof {
  const fitness = winnerFitness(events, candidate.id);
  const energy =
    deriveEnergyByAgenome(events).find((r) => r.agenomeId === candidate.agenomeId) ?? null;
  return {
    winner,
    candidate,
    reviews: deriveReviewsByCandidate(events).get(candidate.id) ?? [],
    checks: deriveChecksByCandidate(events).get(candidate.id) ?? [],
    fitnessTotal: fitness?.total ?? null,
    fitnessComponents: fitness?.components ?? null,
    energy,
    traces: winnerTraces(events, candidate.id),
  };
}
