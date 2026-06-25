import type { RunEventRow } from '../../event-store';
import type { KillPlanSummary } from '../caps/killSwitch';

/**
 * P3.11 — the run-terminal PARTIAL SUMMARY + the scored-survivor projection (ARCHITECTURE.md §3/§5, KEY
 * SAFETY RULE #7). PURE over the persisted log (no IO, no clock, no RNG) so the same log always yields the
 * same summary (replay-stable). Composes the scored-survivor history (the §3 `selected = scored ∧ ¬culled`
 * projection) + the optional P3.10e `KillPlanSummary` (the kill evidence) into the terminal event's payload.
 */

export interface ScoredSurvivor {
  readonly candidateId: string;
  readonly total: number;
  readonly sequence: number;
}

/** The partial terminal summary persisted on a non-completed terminal (failed/stopped/cancelled/crash). */
export interface PartialTerminalSummary {
  readonly generationsObserved: number;
  readonly scoredSurvivorCount: number;
  readonly finalIdeaRef: string | null;
  readonly killSummary?: KillPlanSummary;
}

/**
 * Culled ENTITY ids from `lineage.culled`. The REAL cull is AGENOME-keyed — `cull` emits the culled agenome
 * ids in `payload.targetIds` with NO envelope `candidateId` — so a culled lineage is matched by AGENOME id
 * (see `scoredSurvivors`). The envelope `candidateId` form (a per-candidate cull) is honoured defensively.
 * Pure over the log.
 */
function culledEntityIds(log: readonly RunEventRow[]): Set<string> {
  const culled = new Set<string>();
  for (const row of log) {
    if (row.type !== 'lineage.culled') continue;
    if (row.candidateId) culled.add(row.candidateId);
    const targets = (row.payload as { targetIds?: unknown }).targetIds;
    if (Array.isArray(targets)) {
      for (const target of targets) if (typeof target === 'string') culled.add(target);
    }
  }
  return culled;
}

/** candidateId → agenomeId, from `candidate.created` (carries both on the envelope, generationLoop.ts). Pure. */
function candidateAgenomeIds(log: readonly RunEventRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of log) {
    if (row.type === 'candidate.created' && row.candidateId && row.agenomeId) {
      map.set(row.candidateId, row.agenomeId);
    }
  }
  return map;
}

/**
 * The scored survivors across the whole run: every `fitness.scored` candidate whose lineage was NOT
 * `lineage.culled` (§3 `selected = scored ∧ ¬culled`, LESSONS §54/§63). A candidate is excluded when EITHER
 * its own id OR its agenome's id is in the culled set — the AGENOME-keyed form is what `cull` actually emits
 * (the prior agenomeId-vs-candidateId mismatch let culled lineages still win). `total` is read from the
 * persisted `FitnessScore` payload (rule #7 — never recomputed); a non-numeric total degrades to -∞.
 */
export function scoredSurvivors(log: readonly RunEventRow[]): ScoredSurvivor[] {
  const culled = culledEntityIds(log);
  const candidateAgenome = candidateAgenomeIds(log);
  const survivors: ScoredSurvivor[] = [];
  for (const row of log) {
    if (row.type !== 'fitness.scored' || !row.candidateId) continue;
    if (culled.has(row.candidateId)) continue; // per-candidate cull (defensive)
    const agenomeId = candidateAgenome.get(row.candidateId);
    if (agenomeId !== undefined && culled.has(agenomeId)) continue; // agenome-keyed cull (the real form)
    const rawTotal = (row.payload as { total?: unknown }).total;
    const total = typeof rawTotal === 'number' ? rawTotal : Number.NEGATIVE_INFINITY;
    survivors.push({ candidateId: row.candidateId, total, sequence: row.sequence });
  }
  return survivors;
}

/**
 * The best-so-far scored survivor = the top-`total` survivor, tie-broken by LOWEST `sequence` (deterministic
 * → the same log always yields the same final idea, replay-stable rule #7). `null` when no scored survivor.
 */
export function bestScoredSurvivor(log: readonly RunEventRow[]): ScoredSurvivor | null {
  let best: ScoredSurvivor | null = null;
  for (const survivor of scoredSurvivors(log)) {
    if (
      best === null ||
      survivor.total > best.total ||
      (survivor.total === best.total && survivor.sequence < best.sequence)
    ) {
      best = survivor;
    }
  }
  return best;
}

/**
 * Compose the partial terminal summary from the persisted log (+ the optional kill evidence). Counts the
 * generations observed (distinct `generation.started`), the distinct scored survivors, and the best-so-far
 * final idea. Pure — no IO/clock/RNG.
 */
export function buildPartialTerminalSummary(
  log: readonly RunEventRow[],
  killSummary?: KillPlanSummary,
): PartialTerminalSummary {
  const generations = new Set<string>();
  for (const row of log) {
    if (row.type === 'generation.started' && row.generationId) generations.add(row.generationId);
  }
  const survivors = scoredSurvivors(log);
  const distinctSurvivors = new Set(survivors.map((survivor) => survivor.candidateId));
  const best = bestScoredSurvivor(log);
  return {
    generationsObserved: generations.size,
    scoredSurvivorCount: distinctSurvivors.size,
    finalIdeaRef: best?.candidateId ?? null,
    ...(killSummary !== undefined ? { killSummary } : {}),
  };
}
