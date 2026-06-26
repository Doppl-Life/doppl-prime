import type { CandidateIdea, EvidenceRef } from '@doppl/contracts';
import {
  buildProjection,
  type RunEventRow,
  type WatermarkedProjection,
} from './projection-builder';

/**
 * ResearchNote projection (Knowledge Space slice 1, ARCHITECTURE.md §9/§10, key safety rules #2 + #7).
 *
 * The agents' research is ALREADY in the append-only log: every `tool_call.finished` carries the tool, the
 * query, the grounded result, and (on the envelope) the `agenomeId` that did the research and its
 * `generationId`. So the knowledge space is a DERIVED, rebuildable PROJECTION over `run_events` — NOT a new
 * system of record (rule #2). This is the stigmergy substrate: each note is a pheromone trace an agent left
 * in the shared environment; later slices add embeddings (pgvector), in-run retrieval, and the migration viz.
 *
 * This slice is the pure structural fold: `tool_call.finished` → a normalized {@link ResearchNote}
 * (tool + query + a lean snippet + extracted source URLs) plus the lineage edges that "write themselves from
 * the log": an `agenome →(researched) note` edge, and — when a `candidate.created`'s `evidenceRefs` cite a
 * note's source event — a `candidate →(cited) note` edge. Pure: it folds the persisted log and calls no
 * provider/embedding (rule #7); the full result text stays in the log (the projection keeps only a snippet).
 */

export interface ResearchNote {
  /** Deterministic, replay-stable id: `research-note:{runId}:{sequence}` (sequence is the sole ordering key). */
  readonly id: string;
  readonly runId: string;
  readonly generationId: string | null;
  /** The agenome that performed the research (the "researched" lineage edge source). */
  readonly agenomeId: string | null;
  /** web_search | fetch_url | x_search | youtube_search (open string — the frozen allowlist lives in TU.1). */
  readonly toolName: string;
  /** The research query (e.g. a web_search string / a fetched URL). Optional — some calls carry none. */
  readonly query?: string;
  /** A lean, whitespace-collapsed excerpt of the grounded result (the full text stays in the log, rule #2). */
  readonly snippet: string;
  /** Source URLs extracted from the query + result (the grounding links — the citations of this trace). */
  readonly sourceUrls: string[];
  /** Provenance: the per-run sequence + the `tool_call.finished` event id (used to match candidate citations). */
  readonly sequence: number;
  readonly eventId: string;
}

export type ResearchEdgeType = 'researched' | 'cited';

export interface ResearchEdge {
  readonly id: string;
  /** agenomeId (researched) or candidateId (cited). */
  readonly source: string;
  /** the ResearchNote id. */
  readonly target: string;
  readonly type: ResearchEdgeType;
}

/**
 * An agenome that did research — carries its GRAVEYARD status: was it culled, and at what score? Research
 * from a culled lineage is a "map of dead ends" (the swarm tried this and it scored low) — surfacing it
 * fights survivorship bias so other agents stop re-walking known walls (the design's graveyard feature).
 */
export interface ResearchAgenome {
  readonly id: string;
  /** True iff this agenome appeared in a `lineage.culled.targetIds` (selection killed the lineage). */
  readonly culled: boolean;
  /** The cull score from `lineage.culled.scoreSnapshot` (the dead-end's fitness), when culled. */
  readonly score?: number;
}

/** The folded knowledge graph: notes + edges + the researching agenomes' graveyard status, each keyed by id. */
export interface ResearchKnowledgeGraph {
  readonly notes: Record<string, ResearchNote>;
  readonly edges: Record<string, ResearchEdge>;
  readonly agenomes: Record<string, ResearchAgenome>;
}

export function emptyResearchGraph(): ResearchKnowledgeGraph {
  return { notes: {}, edges: {}, agenomes: {} };
}

/** Snippet length — long enough to be meaningful on hover, short enough to keep the projection lean. */
const RESEARCH_SNIPPET_MAX = 280;
/** Matches http(s) URLs; trailing sentence punctuation is stripped after the match. */
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

function toSnippet(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= RESEARCH_SNIPPET_MAX ? clean : `${clean.slice(0, RESEARCH_SNIPPET_MAX)}…`;
}

function extractUrls(text: string): string[] {
  const urls: string[] = [];
  for (const match of text.matchAll(URL_RE)) {
    const url = match[0].replace(/[.,;:)\]}>'"]+$/, ''); // strip trailing punctuation the regex over-captured
    if (url.length > 0 && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

function stringField(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
}

/** The loop persists the tool's RAW arguments JSON as `query` (e.g. `{"query":"…"}` / `{"url":"…"}`).
 *  Normalize to the human query/url for readable notes; a non-JSON value passes through unchanged. */
function normalizeQuery(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const inner = parsed.query ?? parsed.url ?? parsed.q;
      if (typeof inner === 'string' && inner.length > 0) return inner;
    } catch {
      // not JSON — fall through to the raw value
    }
  }
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * The reducer (injected into the §51 `buildProjection`): folds `tool_call.finished` into notes + a
 * `researched` edge, and `candidate.created` evidenceRef citations into `cited` edges. Every other event is
 * a no-op. Pure — no provider/embedding (rule #7); the citation match is by the persisted event id.
 */
export function researchNotesReducer(
  state: ResearchKnowledgeGraph,
  event: RunEventRow,
): ResearchKnowledgeGraph {
  switch (event.type) {
    case 'tool_call.finished': {
      const payload = event.payload as Record<string, unknown>;
      const toolName = stringField(payload, 'toolName') ?? 'unknown';
      const query = normalizeQuery(stringField(payload, 'query'));
      const result = stringField(payload, 'result') ?? '';
      const noteId = `research-note:${event.runId}:${event.sequence}`;
      const note: ResearchNote = {
        id: noteId,
        runId: event.runId,
        generationId: event.generationId,
        agenomeId: event.agenomeId,
        toolName,
        ...(query !== undefined ? { query } : {}),
        snippet: toSnippet(result !== '' ? result : (query ?? '')),
        sourceUrls: extractUrls(`${query ?? ''}\n${result}`),
        sequence: event.sequence,
        eventId: event.id,
      };
      const notes = { ...state.notes, [noteId]: note };
      if (event.agenomeId === null) return { ...state, notes };
      const edgeId = `researched:${event.agenomeId}->${noteId}`;
      // Record the researching agenome (default not-culled). Do NOT clobber an already-recorded culled
      // status — a `lineage.culled` may have folded BEFORE this note (ordering-robust).
      const agenomes =
        state.agenomes[event.agenomeId] !== undefined
          ? state.agenomes
          : { ...state.agenomes, [event.agenomeId]: { id: event.agenomeId, culled: false } };
      return {
        notes,
        agenomes,
        edges: {
          ...state.edges,
          [edgeId]: { id: edgeId, source: event.agenomeId, target: noteId, type: 'researched' },
        },
      };
    }
    case 'lineage.culled': {
      // The graveyard: mark each culled agenome + carry its cull score (the dead-end's fitness). Merge so a
      // culled agenome that also researched keeps a single record; create one if the cull precedes its notes.
      const payload = event.payload as {
        targetIds?: unknown;
        scoreSnapshot?: Record<string, unknown>;
      };
      const targetIds = Array.isArray(payload.targetIds) ? payload.targetIds : [];
      const snapshot = payload.scoreSnapshot ?? {};
      let agenomes = state.agenomes;
      for (const targetId of targetIds) {
        if (typeof targetId !== 'string') continue;
        const score = snapshot[targetId];
        agenomes = {
          ...agenomes,
          [targetId]: {
            id: targetId,
            culled: true,
            ...(typeof score === 'number' ? { score } : {}),
          },
        };
      }
      return agenomes === state.agenomes ? state : { ...state, agenomes };
    }
    case 'candidate.created': {
      const candidate = event.payload as Partial<CandidateIdea>;
      const candidateId = candidate.id;
      const refs = candidate.evidenceRefs;
      if (typeof candidateId !== 'string' || !Array.isArray(refs)) return state;
      let edges = state.edges;
      for (const ref of refs as EvidenceRef[]) {
        const refEventId = ref.eventId;
        if (typeof refEventId !== 'string') continue;
        const cited = Object.values(state.notes).find((note) => note.eventId === refEventId);
        if (cited === undefined) continue;
        const edgeId = `cited:${candidateId}->${cited.id}`;
        edges = {
          ...edges,
          [edgeId]: { id: edgeId, source: candidateId, target: cited.id, type: 'cited' },
        };
      }
      return edges === state.edges ? state : { ...state, edges };
    }
    default:
      return state;
  }
}

/** Convenience: fold a run's events into a watermark-tagged knowledge graph via the §51 builder. */
export function buildResearchNotes(
  events: readonly RunEventRow[],
): WatermarkedProjection<ResearchKnowledgeGraph> {
  return buildProjection(events, researchNotesReducer, emptyResearchGraph());
}
