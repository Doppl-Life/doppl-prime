import type { RunEventRow } from './projection-builder';
import { buildCurrentState } from './current-state';

/**
 * RunSummary projection (the Runs-table row, GET /runs) — a pure fold over ONE run's persisted events into
 * the metadata the runs list shows: status + the selected winner (reusing the current-state projection),
 * the creation time + problem statement (from `run.configured`), and the activity counts. Derived +
 * rebuildable (rule #2); folds the log with no provider/embedding (rule #7). NOT an Appendix-A contract —
 * an apps/api-internal read shape, like the current-state projection it composes.
 *
 * Requires a NON-EMPTY event list (the GET /runs handler already skips empty runs) — `buildCurrentState`
 * rejects an empty fold.
 */

const PROBLEM_TITLE_MAX = 200;
const SUMMARY_MAX = 240;

export interface RunSummaryItem {
  readonly runId: string;
  readonly status: string | null;
  readonly sequenceThrough: number;
  /** ISO timestamp the run was configured (`run.configured.occurredAt`), or null if absent. */
  readonly createdAt: string | null;
  /** The per-run problem statement (`run.configured.seed`), truncated; null if absent. */
  readonly problem: string | null;
  /** The selected winner's title + a truncated summary, or null when no winner (in-progress/failed). */
  readonly finalIdeaTitle: string | null;
  readonly finalIdeaSummary: string | null;
  /** Activity counts — generations completed, candidates created, and reproduction/cull/mutation events. */
  readonly generations: number;
  readonly candidates: number;
  readonly reproductions: number;
  readonly culls: number;
  readonly mutations: number;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/**
 * The problem TITLE for the runs list — the seed without its "Problem:" label boilerplate, collapsed to a
 * single line (some seeds are multi-paragraph briefs), reduced to the first sentence when that's a
 * reasonable length (the gist), and capped. So the list shows the problem itself, not "Problem: hospital…".
 */
function problemTitle(seed: string): string {
  const cleaned = seed
    .replace(/^\s*problem\s*:\s*/i, '') // drop a leading "Problem:" label
    .replace(/\s+/g, ' ') // collapse newlines/whitespace (multi-line seeds → one line)
    .trim();
  const firstSentence = /^(.+?[.?!])(\s|$)/.exec(cleaned)?.[1];
  const title =
    firstSentence !== undefined && firstSentence.length <= PROBLEM_TITLE_MAX
      ? firstSentence
      : cleaned;
  return truncate(title, PROBLEM_TITLE_MAX);
}

function stringField(payload: unknown, key: string): string | null {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

export function buildRunSummary(events: readonly RunEventRow[]): RunSummaryItem {
  const { state, sequenceThrough } = buildCurrentState(events);
  const runId = events[0]!.runId;
  const status = state.runs[runId]?.status ?? null;

  // The winner = the candidate the §92 winnerReducer set to `status:'selected'` (from run.completed's
  // finalIdeaRef). Title + a truncated summary; absent for an in-progress / failed / no-survivor run.
  const winner = Object.values(state.candidateIdeas).find((c) => c.status === 'selected');

  // The creation time + problem from `run.configured` (the route appends it at POST /runs).
  const configured = events.find((e) => e.type === 'run.configured');
  const seed = configured ? stringField(configured.payload, 'seed') : null;

  let generations = 0;
  let candidates = 0;
  let reproductions = 0;
  let culls = 0;
  let mutations = 0;
  for (const event of events) {
    switch (event.type) {
      case 'generation.completed':
        generations += 1;
        break;
      case 'candidate.created':
        candidates += 1;
        break;
      case 'agenome.reproduced':
        reproductions += 1;
        break;
      case 'lineage.culled':
        culls += 1;
        break;
      case 'agenome.mutated':
        mutations += 1;
        break;
      default:
        break;
    }
  }

  return {
    runId,
    status,
    sequenceThrough,
    createdAt: configured ? configured.occurredAt.toISOString() : null,
    problem: seed !== null ? problemTitle(seed) : null,
    finalIdeaTitle: winner?.title ?? null,
    finalIdeaSummary: winner ? truncate(winner.summary, SUMMARY_MAX) : null,
    generations,
    candidates,
    reproductions,
    culls,
    mutations,
  };
}
