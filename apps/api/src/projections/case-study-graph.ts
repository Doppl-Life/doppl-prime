import type { RunEventRow } from './projection-builder';
import { buildCurrentState } from './current-state';
import { problemTitle } from './run-summary';

/**
 * CaseStudyGraph projection (Islands pivot A3) — the FIRST cross-run read model: a case study → its runs →
 * each run's doppels (the crowned winners). Recovers the islands graph purely by JOIN on `caseStudyId` (the
 * run.configured payload metadata, A1) rather than ID-spelunking. Derived + rebuildable (rule #2); folds the
 * log with no provider (rule #7). NOT an Appendix-A contract — an apps/api-internal read shape, like
 * RunSummaryItem.
 *
 * CROSS-RUN by COMPOSITION: every existing projection is scoped to ONE runId (buildProjection throws on a
 * mixed-run fold by design, LESSONS §51). So this composes N per-run current-state folds (one readByRun per
 * run, each folded independently) and stitches the results — it never folds a mixed event stream. The caller
 * (the GET /case-studies/:id/graph route) supplies the per-run event lists for the runs that carry the
 * caseStudyId (listCaseStudyRunIds).
 */

const DOPPEL_SUMMARY_MAX = 240;

export interface CaseStudyDoppel {
  /** The crowned winner candidate's id (a `'selected'` candidate, Islands pivot A2). */
  readonly candidateId: string;
  readonly title: string;
  readonly summary: string;
}

export interface CaseStudyRunNode {
  readonly runId: string;
  readonly status: string | null;
  /** The run's problem title (run.configured.seed, truncated), or null. */
  readonly problem: string | null;
  /** ISO timestamp the run was configured, or null. */
  readonly createdAt: string | null;
  /** The crowned winners of this run (all `'selected'` candidates) — the doppels branching off this run. */
  readonly doppels: CaseStudyDoppel[];
}

export interface CaseStudyGraph {
  readonly caseStudyId: string;
  /** The runs executed against this case study, newest-first (a run missing a creation time sorts last). */
  readonly runs: CaseStudyRunNode[];
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function stringField(payload: unknown, key: string): string | null {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

/** Build one run's case-study node from its events — a single per-run current-state fold (never mixed-run). */
export function buildCaseStudyRunNode(events: readonly RunEventRow[]): CaseStudyRunNode {
  const { state } = buildCurrentState(events);
  const runId = events[0]!.runId;
  const status = state.runs[runId]?.status ?? null;
  const configured = events.find((e) => e.type === 'run.configured');
  const seed = configured ? stringField(configured.payload, 'seed') : null;
  const doppels: CaseStudyDoppel[] = Object.values(state.candidateIdeas)
    .filter((c) => c.status === 'selected')
    .map((c) => ({
      candidateId: c.id,
      title: c.title,
      summary: truncate(c.summary, DOPPEL_SUMMARY_MAX),
    }));
  return {
    runId,
    status,
    problem: seed !== null ? problemTitle(seed) : null,
    createdAt: configured ? configured.occurredAt.toISOString() : null,
    doppels,
  };
}

/**
 * Compose the case-study graph from the per-run event lists of the runs that carry `caseStudyId`. Each run is
 * folded independently (per-run current-state) then stitched; runs are ordered newest-first. Empty input → an
 * empty-but-valid graph (a case study with no runs yet is a valid empty island). Pure.
 */
export function buildCaseStudyGraph(
  caseStudyId: string,
  runEventLists: readonly (readonly RunEventRow[])[],
): CaseStudyGraph {
  const runs = runEventLists
    .filter((events) => events.length > 0)
    .map((events) => buildCaseStudyRunNode(events));
  runs.sort((a, b) => {
    if (a.createdAt === b.createdAt) return 0;
    if (a.createdAt === null) return 1;
    if (b.createdAt === null) return -1;
    return a.createdAt < b.createdAt ? 1 : -1; // descending: newest first
  });
  return { caseStudyId, runs };
}
