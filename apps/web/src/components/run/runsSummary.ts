import type { RunSummary } from '../../data/runClient';

/**
 * runsSummary — pure, presentation-free derivations for the Runs home (KPI strip, status filtering,
 * and date grouping). Kept out of the .tsx so the math is unit-testable without a DOM and the view
 * files stay declarative. Read-only over the enriched RunSummary (rule #2); no styling lives here.
 */

/** The status-filter buckets the FilterBar offers. `all` is the identity (no filtering). */
export type RunFilter = 'all' | 'running' | 'complete' | 'failed';

const LIVE_STATUSES = new Set(['running', 'completing', 'stopping']);
const COMPLETE_STATUSES = new Set(['completed']);
const FAILED_STATUSES = new Set(['failed', 'stopped', 'cancelled']);

/** A run with no winner AND a terminal-failure status never produced a final idea — say so plainly. */
export function failedBeforeGenerating(run: RunSummary): boolean {
  const hasIdea = Boolean(run.finalIdeaTitle && run.finalIdeaTitle.length > 0);
  return !hasIdea && run.status !== null && FAILED_STATUSES.has(run.status);
}

function matchesFilter(status: string | null, filter: RunFilter): boolean {
  if (filter === 'all') return true;
  if (status === null) return false;
  if (filter === 'running') return LIVE_STATUSES.has(status);
  if (filter === 'complete') return COMPLETE_STATUSES.has(status);
  return FAILED_STATUSES.has(status);
}

/** Free-text match over the fields a human scans for — problem, final idea, and the run id. */
function matchesQuery(run: RunSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  const haystacks = [run.problem, run.finalIdeaTitle, run.runId];
  return haystacks.some((h) => (h ?? '').toLowerCase().includes(q));
}

export function filterRuns(
  runs: readonly RunSummary[],
  filter: RunFilter,
  query: string,
): readonly RunSummary[] {
  return runs.filter((r) => matchesFilter(r.status, filter) && matchesQuery(r, query));
}

/** Per-bucket counts so the filter chips can show how many runs each filter would reveal. */
export interface RunFilterCounts {
  readonly all: number;
  readonly running: number;
  readonly complete: number;
  readonly failed: number;
}
export function countByFilter(runs: readonly RunSummary[]): RunFilterCounts {
  return {
    all: runs.length,
    running: runs.filter((r) => matchesFilter(r.status, 'running')).length,
    complete: runs.filter((r) => matchesFilter(r.status, 'complete')).length,
    failed: runs.filter((r) => matchesFilter(r.status, 'failed')).length,
  };
}

/** The headline numbers above the table. Percentages are integers; avg is rounded to a whole count. */
export interface RunKpis {
  readonly total: number;
  readonly running: number;
  readonly successRatePct: number;
  readonly avgCandidates: number;
  readonly lastRunIso: string | null;
}
export function computeKpis(runs: readonly RunSummary[]): RunKpis {
  const total = runs.length;
  const running = runs.filter((r) => r.status !== null && LIVE_STATUSES.has(r.status)).length;
  const completed = runs.filter((r) => r.status !== null && COMPLETE_STATUSES.has(r.status));
  const decided = runs.filter(
    (r) => r.status !== null && (COMPLETE_STATUSES.has(r.status) || FAILED_STATUSES.has(r.status)),
  ).length;
  const successRatePct = decided === 0 ? 0 : Math.round((completed.length / decided) * 100);
  // Average over the runs that actually produced candidates — failed-before-generating zeros would
  // otherwise drag the throughput figure toward a misleading floor.
  const producing = completed.length > 0 ? completed : runs;
  const withCands = producing.filter((r) => (r.candidates ?? 0) > 0);
  const avgCandidates =
    withCands.length === 0
      ? 0
      : Math.round(withCands.reduce((sum, r) => sum + (r.candidates ?? 0), 0) / withCands.length);
  const lastRunIso =
    runs.map((r) => r.createdAt ?? null).filter((d): d is string => d !== null)[0] ?? null;
  return { total, running, successRatePct, avgCandidates, lastRunIso };
}

/** "just now" / "5m ago" / "3h ago" / "2d ago", falling back to a date past a week. */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const sec = Math.max(0, Math.round((now - then) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** A coarse day bucket label — "Today" / "Yesterday" / "Jun 24" — for the table's group headers. */
export function dayBucketLabel(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'Undated';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Undated';
  const startOf = (t: number): number => {
    const x = new Date(t);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const days = Math.round((startOf(now) - startOf(d.getTime())) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Time-of-day only ("10:42 AM") — the day already lives in the group header, so rows show just the time. */
export function timeOfDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export interface RunRow {
  readonly run: RunSummary;
  /** 1-based date-order index across the whole (pre-grouping) list — the table's "#" column. */
  readonly index: number;
}
export interface RunGroup {
  readonly label: string;
  readonly rows: readonly RunRow[];
}

/** Group an already-newest-first list into consecutive day buckets, preserving a global 1-based index. */
export function groupRunsByDay(runs: readonly RunSummary[], now: number = Date.now()): RunGroup[] {
  const groups: RunGroup[] = [];
  runs.forEach((run, i) => {
    const label = dayBucketLabel(run.createdAt, now);
    const last = groups[groups.length - 1];
    const row: RunRow = { run, index: i + 1 };
    if (last && last.label === label) {
      (last.rows as RunRow[]).push(row);
    } else {
      groups.push({ label, rows: [row] });
    }
  });
  return groups;
}

/** Normalize a count to 0..1 against the largest count in view, so meter LENGTH is comparable per page. */
export function normalize(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

/** The fitness the row reports — the winner's score, else the last generation's best, else null. */
export function runFitness(run: RunSummary): number | null {
  if (run.winnerFitness !== null && run.winnerFitness !== undefined) return run.winnerFitness;
  const series = run.fitnessByGeneration ?? [];
  return series.length > 0 ? (series[series.length - 1] as number) : null;
}

export type SortKey = 'time' | 'problem' | 'status' | 'cands' | 'gens' | 'fitness';
export interface SortState {
  readonly key: SortKey;
  readonly dir: 'asc' | 'desc';
}
/** The list's natural order: newest first (matches the backend + the day grouping). */
export const DEFAULT_SORT: SortState = { key: 'time', dir: 'desc' };
export function isDefaultSort(sort: SortState): boolean {
  return sort.key === DEFAULT_SORT.key && sort.dir === DEFAULT_SORT.dir;
}
/** Toggle direction when re-selecting the active key; otherwise adopt the key's sensible default dir. */
export function nextSort(current: SortState, key: SortKey): SortState {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: key === 'problem' ? 'asc' : 'desc' };
}

function compareBy(key: SortKey, a: RunSummary, b: RunSummary): number {
  switch (key) {
    case 'problem':
      return (a.problem ?? '').localeCompare(b.problem ?? '');
    case 'status':
      return (a.status ?? '').localeCompare(b.status ?? '');
    case 'cands':
      return (a.candidates ?? 0) - (b.candidates ?? 0);
    case 'gens':
      return (a.generations ?? 0) - (b.generations ?? 0);
    case 'fitness':
      return (runFitness(a) ?? -1) - (runFitness(b) ?? -1);
    case 'time':
    default: {
      const av = a.createdAt ?? '';
      const bv = b.createdAt ?? '';
      return av < bv ? -1 : av > bv ? 1 : 0;
    }
  }
}

/** Stable sort over a copy; `dir` flips the comparator. Default (time desc) preserves backend order. */
export function sortRuns(runs: readonly RunSummary[], sort: SortState): readonly RunSummary[] {
  const factor = sort.dir === 'asc' ? 1 : -1;
  return [...runs].sort((a, b) => factor * compareBy(sort.key, a, b));
}
