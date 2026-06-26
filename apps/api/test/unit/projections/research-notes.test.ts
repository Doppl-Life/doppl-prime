import { describe, it, expect } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import type { RunEventType } from '@doppl/contracts';
import type { RunEventRow } from '../../../src/event-store';
import { canonicalize } from '../../../src/projections/projection-builder';
import {
  buildResearchNotes,
  emptyResearchGraph,
  researchNotesReducer,
  type ResearchKnowledgeGraph,
} from '../../../src/projections/research-notes';

/**
 * ResearchNote projection (KB slice 1) — a PURE fold over `tool_call.finished` (the research already in the
 * log, rule #2) into normalized notes + lineage edges (agenome→note "researched", candidate→note "cited").
 * Replay-safe by construction (folds the persisted log, no provider — rule #7). Mirrors §51/§53.
 */

let autoSeq = 0;
function row(over: Partial<RunEventRow> & { type: RunEventType }): RunEventRow {
  const sequence = over.sequence ?? autoSeq++;
  return {
    id: over.id ?? `e-${sequence}`,
    runId: over.runId ?? 'run_1',
    generationId: over.generationId ?? 'run_1-gen0',
    agenomeId: over.agenomeId ?? null,
    candidateId: over.candidateId ?? null,
    type: over.type,
    sequence,
    occurredAt: over.occurredAt ?? new Date(0),
    actor: over.actor ?? 'agenome',
    correlationId: null,
    langfuseTraceId: null,
    langfuseObservationId: null,
    payload: over.payload ?? {},
    schemaVersion: over.schemaVersion ?? CURRENT_SCHEMA_VERSION,
  } as RunEventRow;
}

const toolFinished = (
  over: Partial<RunEventRow> & { payload: Record<string, unknown> },
): RunEventRow => row({ ...over, type: 'tool_call.finished' });

function fold(events: RunEventRow[]): ResearchKnowledgeGraph {
  return events.reduce(researchNotesReducer, emptyResearchGraph());
}

describe('researchNotesReducer — tool_call.finished → ResearchNote', () => {
  it('turns a tool_call.finished into a normalized note keyed by research-note:{runId}:{sequence}', () => {
    const state = fold([
      toolFinished({
        agenomeId: 'ag1',
        generationId: 'run_1-gen2',
        sequence: 7,
        id: 'evt-7',
        payload: {
          toolName: 'web_search',
          query: 'solid state batteries',
          result: 'Real grounded findings.',
        },
      }),
    ]);
    const note = state.notes['research-note:run_1:7'];
    expect(note).toMatchObject({
      id: 'research-note:run_1:7',
      runId: 'run_1',
      generationId: 'run_1-gen2',
      agenomeId: 'ag1',
      toolName: 'web_search',
      query: 'solid state batteries',
      sequence: 7,
      eventId: 'evt-7',
    });
    expect(note?.snippet).toContain('Real grounded findings');
  });

  it('emits a "researched" edge from the agenome to the note', () => {
    const state = fold([
      toolFinished({
        agenomeId: 'ag1',
        sequence: 3,
        payload: { toolName: 'x_search', result: 'chatter' },
      }),
    ]);
    expect(Object.values(state.edges)).toEqual([
      {
        id: 'researched:ag1->research-note:run_1:3',
        source: 'ag1',
        target: 'research-note:run_1:3',
        type: 'researched',
      },
    ]);
  });

  it('extracts source URLs from the result body AND from a fetch_url query', () => {
    const state = fold([
      toolFinished({
        sequence: 1,
        payload: {
          toolName: 'x_search',
          result: 'See Sources:\n- https://x.com/foo/status/123\n- https://example.com/a).',
        },
      }),
      toolFinished({
        sequence: 2,
        payload: {
          toolName: 'fetch_url',
          query: 'https://en.wikipedia.org/wiki/Battery',
          result: 'page text',
        },
      }),
    ]);
    expect(state.notes['research-note:run_1:1']?.sourceUrls).toEqual([
      'https://x.com/foo/status/123',
      'https://example.com/a', // trailing punctuation stripped
    ]);
    expect(state.notes['research-note:run_1:2']?.sourceUrls).toEqual([
      'https://en.wikipedia.org/wiki/Battery',
    ]);
  });

  it('truncates the snippet (the full content stays in the log — the projection stays lean, rule #2)', () => {
    const long = 'x'.repeat(5000);
    const state = fold([
      toolFinished({ sequence: 1, payload: { toolName: 'web_search', result: long } }),
    ]);
    expect(state.notes['research-note:run_1:1']!.snippet.length).toBeLessThan(400);
  });

  it('normalizes the raw JSON tool-arguments query to the human query/url (the loop persists raw args)', () => {
    const state = fold([
      toolFinished({
        sequence: 1,
        payload: {
          toolName: 'web_search',
          result: 'r',
          query: '{"query": "food waste in grocery stores"}',
        },
      }),
      toolFinished({
        sequence: 2,
        payload: {
          toolName: 'fetch_url',
          result: 'page',
          query: '{"url": "https://example.com/x"}',
        },
      }),
    ]);
    expect(state.notes['research-note:run_1:1']?.query).toBe('food waste in grocery stores');
    expect(state.notes['research-note:run_1:2']?.query).toBe('https://example.com/x');
    expect(state.notes['research-note:run_1:2']?.sourceUrls).toContain('https://example.com/x');
  });

  it('falls back to the query for the snippet when there is no result', () => {
    const state = fold([
      toolFinished({
        sequence: 1,
        payload: { toolName: 'web_search', query: 'why batteries swell' },
      }),
    ]);
    expect(state.notes['research-note:run_1:1']?.snippet).toBe('why batteries swell');
  });

  it('is idempotent on re-fold (keyed by id — same events → byte-identical state)', () => {
    const events = [
      toolFinished({
        agenomeId: 'ag1',
        sequence: 1,
        payload: { toolName: 'web_search', result: 'a' },
      }),
      toolFinished({
        agenomeId: 'ag1',
        sequence: 2,
        payload: { toolName: 'x_search', result: 'b' },
      }),
    ];
    expect(canonicalize(fold(events))).toBe(canonicalize(fold([...events, ...events])));
  });

  it('no-ops on unrelated events', () => {
    const state = fold([
      row({ type: 'fitness.scored', payload: { candidateId: 'c1', total: 0.5 } }),
    ]);
    expect(state).toEqual(emptyResearchGraph());
  });
});

describe('researchNotesReducer — candidate citation edges', () => {
  it('links candidate→note "cited" when a candidate.created evidenceRef points at the note\'s event', () => {
    const state = fold([
      toolFinished({
        agenomeId: 'ag1',
        sequence: 1,
        id: 'tool-evt-1',
        payload: { toolName: 'web_search', result: 'r' },
      }),
      row({
        type: 'candidate.created',
        sequence: 2,
        candidateId: 'cand-9',
        payload: {
          id: 'cand-9',
          evidenceRefs: [
            { eventId: 'tool-evt-1', label: 'web' },
            { uri: 'https://x', label: 'other' },
          ],
        },
      }),
    ]);
    expect(state.edges['cited:cand-9->research-note:run_1:1']).toEqual({
      id: 'cited:cand-9->research-note:run_1:1',
      source: 'cand-9',
      target: 'research-note:run_1:1',
      type: 'cited',
    });
  });

  it('adds no citation edge when no evidenceRef matches a known note', () => {
    const state = fold([
      toolFinished({
        sequence: 1,
        id: 'tool-evt-1',
        payload: { toolName: 'web_search', result: 'r' },
      }),
      row({
        type: 'candidate.created',
        sequence: 2,
        payload: { id: 'cand-9', evidenceRefs: [{ eventId: 'no-such-event' }] },
      }),
    ]);
    expect(Object.values(state.edges).some((e) => e.type === 'cited')).toBe(false);
  });
});

describe('buildResearchNotes — via the §51 builder (watermark + ordered fold)', () => {
  it("returns a watermark-tagged graph over a run's events", () => {
    const events = [
      toolFinished({
        sequence: 0,
        agenomeId: 'ag0',
        payload: { toolName: 'web_search', result: 'r0' },
      }),
      toolFinished({
        sequence: 1,
        agenomeId: 'ag1',
        payload: { toolName: 'youtube_search', result: 'r1' },
      }),
    ];
    const projection = buildResearchNotes(events);
    expect(projection.runId).toBe('run_1');
    expect(projection.sequenceThrough).toBe(1);
    expect(Object.keys(projection.state.notes)).toHaveLength(2);
  });
});
