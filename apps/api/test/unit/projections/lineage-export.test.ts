import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { LineageGraphProjection } from '@doppl/contracts';
import { lineageToExport } from '../../../src/projections/lineage-export';

/**
 * P6.11 — the Neo4j lineage-export spike (pure unit). spec(§10): a PURE, derived-only transform of the
 * frozen P6.3 `LineageGraphProjection` into a storage-agnostic Neo4j-importable / dashboard-export
 * shape — carries the `sequenceThrough` watermark (never re-folds the log — LESSONS §30). spec(§9) /
 * rule #2: derived + read-only (structural no-append-import; never writes back). The export retains the
 * genealogy edges + node types/status/metrics so the four Cypher query shapes (ancestors-of-winner,
 * parent-contribution, critic-kill, lineage distance/diversity) are expressible over it.
 */

const FORBIDDEN_IMPORT = /from\s+['"][^'"]*(event-store|run_events|drizzle|\bpg\b|database)/i;
const NEO4J_DRIVER_IMPORT = /from\s+['"][^'"]*neo4j/i;

/** A representative lineage projection: a selected winner with a parent genealogy + a critic-killed sibling. */
const multiNodeLineage: LineageGraphProjection = {
  runId: 'run_e',
  sequenceThrough: 8,
  nodes: [
    {
      id: 'gen_1',
      type: 'generation',
      label: 'Generation gen_1',
      status: 'completed',
      dataRef: 'gen_1',
    },
    {
      id: 'agn_parent',
      type: 'agenome',
      label: 'Agenome agn_parent',
      status: 'reproduced',
      dataRef: 'agn_parent',
    },
    {
      id: 'agn_child',
      type: 'agenome',
      label: 'Agenome agn_child',
      status: 'active',
      dataRef: 'agn_child',
    },
    {
      id: 'cand_win',
      type: 'candidate',
      label: 'Winner idea',
      status: 'selected',
      metrics: { fitness: 0.9, novelty: 0.7 },
      dataRef: 'cand_win',
    },
    {
      id: 'cand_killed',
      type: 'candidate',
      label: 'Killed idea',
      status: 'rejected',
      metrics: { novelty: 0.2 },
      dataRef: 'cand_killed',
    },
    { id: 'rev_1', type: 'critic', label: 'Critic: feasibility', dataRef: 'rev_1' },
    { id: 'chk_1', type: 'check', label: 'subtype_check', dataRef: 'chk_1' },
    { id: 'fit_1', type: 'score', label: 'Fitness 0.9', metrics: { total: 0.9 }, dataRef: 'fit_1' },
  ],
  edges: [
    { id: 'agn_parent->agn_child', source: 'agn_parent', target: 'agn_child', type: 'reproduced' }, // genealogy
    { id: 'agn_child->cand_win', source: 'agn_child', target: 'cand_win', type: 'generated' },
    { id: 'cand_killed->rev_1', source: 'cand_killed', target: 'rev_1', type: 'reviewed_by' }, // critic-kill
  ],
};

describe('lineageToExport — derived read-only Neo4j export (spec §10 / §9)', () => {
  // §10 / LESSONS §30 — a PURE transform: every node/edge maps 1:1 and the sequenceThrough watermark is
  // carried (no re-fold). Positive guard.
  test('test_export_is_pure_transform_carries_watermark', () => {
    const exported = lineageToExport(multiNodeLineage);
    expect(exported.nodes.length).toBe(multiNodeLineage.nodes.length); // 1:1, no re-fold
    expect(exported.edges.length).toBe(multiNodeLineage.edges.length);
    expect(exported.sequenceThrough).toBe(8); // watermark carried through
  });

  // [low gate-fix] — the export carries the projection's runId so a multi-run notebook export can
  // identify which run each node/edge belongs to.
  test('test_lineage_export_carries_run_id', () => {
    expect(lineageToExport(multiNodeLineage).runId).toBe('run_e');
  });

  // §10 — the export retains genealogy edges + node labels/status/metrics so all four query shapes are
  // expressible (ancestors-of-winner, parent-contribution, critic-kill, lineage distance/diversity).
  test('test_export_preserves_query_shape_data', () => {
    const exported = lineageToExport(multiNodeLineage);
    const node = (id: string) => exported.nodes.find((n) => n.id === id);

    // ancestors-of-winner + distance/diversity: the selected winner + its label/status/metrics survive.
    const winner = node('cand_win')!;
    expect(winner.labels).toContain('Candidate');
    expect(winner.props.status).toBe('selected');
    expect((winner.props.metrics as Record<string, number>).novelty).toBe(0.7);

    // parent-contribution / ancestors: the reproduction genealogy edge survives with its type/endpoints.
    const genealogy = exported.edges.find((e) => e.id === 'agn_parent->agn_child')!;
    expect(genealogy.type).toBe('reproduced');
    expect(genealogy.source).toBe('agn_parent');
    expect(genealogy.target).toBe('agn_child');

    // critic-kill: the critic node + reviewed_by edge + the rejected candidate's status survive.
    expect(node('rev_1')!.labels).toContain('Critic');
    expect(exported.edges.find((e) => e.id === 'cand_killed->rev_1')!.type).toBe('reviewed_by');
    expect(node('cand_killed')!.props.status).toBe('rejected');
  });

  // rule #2 — derived + read-only: the module imports nothing from the event-store writer / run_events /
  // drizzle (it can never write back into the authoritative log or a projection).
  test('test_export_is_read_only_no_append_import', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../../src/projections/lineage-export.ts', import.meta.url)),
      'utf8',
    );
    expect(FORBIDDEN_IMPORT.test(src)).toBe(false);
  });

  // §10 — storage-agnostic: no Neo4j-driver/physical-store coupling leaks into apps/api; the export is a
  // neutral node/edge data structure (data, not Cypher strings) the throwaway notebook imports.
  test('test_export_storage_agnostic', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../../src/projections/lineage-export.ts', import.meta.url)),
      'utf8',
    );
    expect(NEO4J_DRIVER_IMPORT.test(src)).toBe(false); // no neo4j driver import in apps/api
    const exported = lineageToExport(multiNodeLineage);
    expect(Object.keys(exported.nodes[0]!).sort()).toEqual(['id', 'labels', 'props']); // neutral node
    expect(Object.keys(exported.edges[0]!).sort()).toEqual([
      'id',
      'props',
      'source',
      'target',
      'type',
    ]);
  });
});
