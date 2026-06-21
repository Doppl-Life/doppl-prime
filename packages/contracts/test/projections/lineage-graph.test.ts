// P0.13 — LineageGraphProjection: the storage-agnostic lineage graph (ARCHITECTURE.md §9/§10, Appendix
// A). spec(§10): a derived, rebuildable projection (nodes/edges + a `sequenceThrough` watermark, §9) —
// it carries NO physical-storage/Neo4j field, so consumers depend on the abstract shape only. The node
// `type` is the closed 6-member union mirroring the frozen entities.
import { describe, it, expect } from 'vitest';
import {
  LineageGraphProjection,
  LineageNode,
  LineageNodeType,
  LineageEdge,
} from '@doppl/contracts';

const validNode = {
  id: 'node_1',
  type: 'candidate',
  label: 'Immune-inspired cold-start recommender',
  status: 'scored',
  metrics: { fitness: 0.81, novelty: 0.72 },
  dataRef: 'cand_1',
};

const validEdge = {
  id: 'edge_1',
  source: 'node_0',
  target: 'node_1',
  type: 'produced',
  label: 'fusion',
};

const validProjection = {
  runId: 'run_1',
  nodes: [validNode],
  edges: [validEdge],
  sequenceThrough: 42,
};

const NODE_TYPES = ['generation', 'agenome', 'candidate', 'critic', 'check', 'score'] as const;
const PROJ_REQUIRED = ['runId', 'nodes', 'edges', 'sequenceThrough'] as const;
const NODE_REQUIRED = ['id', 'type', 'label', 'dataRef'] as const;
const EDGE_REQUIRED = ['id', 'source', 'target', 'type'] as const;

describe('LineageGraphProjection — storage-agnostic lineage graph (spec §10)', () => {
  it('lineage_projection_accepts_valid_and_strict', () => {
    // spec(§10): positive-guard-first — a full projection round-trips; unknown rejected; each required
    // field mandatory; sequenceThrough is a non-negative int watermark (§9 rebuildable/discardable).
    expect(LineageGraphProjection.parse(validProjection)).toEqual(validProjection);
    expect(() => LineageGraphProjection.parse({ ...validProjection, bogus: 1 })).toThrow();
    for (const k of PROJ_REQUIRED) {
      const clone: Record<string, unknown> = { ...validProjection };
      delete clone[k];
      expect(() => LineageGraphProjection.parse(clone), `missing ${k}`).toThrow();
    }
    expect(() =>
      LineageGraphProjection.parse({ ...validProjection, sequenceThrough: -1 }),
    ).toThrow();
    expect(() =>
      LineageGraphProjection.parse({ ...validProjection, sequenceThrough: 1.5 }),
    ).toThrow();
    // a fresh projection through sequence 0 with no nodes/edges parses.
    expect(
      LineageGraphProjection.parse({ ...validProjection, sequenceThrough: 0, nodes: [], edges: [] })
        .sequenceThrough,
    ).toBe(0);
  });

  it('lineage_node_type_closed_6_union', () => {
    // spec(§10): the node `type` is the closed 6-member union mirroring the frozen entities; any
    // other value is rejected.
    for (const t of NODE_TYPES) {
      expect(LineageNodeType.parse(t)).toBe(t);
      expect(LineageNode.parse({ ...validNode, type: t }).type).toBe(t);
    }
    expect(NODE_TYPES).toHaveLength(6);
    expect(() => LineageNodeType.parse('cluster')).toThrow();
    expect(() => LineageNodeType.parse('')).toThrow();
  });

  it('lineage_node_and_edge_strict', () => {
    // spec(§10): LineageNode round-trips with + without the optional status?/metrics?; LineageEdge
    // round-trips with + without the optional label?; both strict (unknown rejected); each required
    // field mandatory.
    expect(LineageNode.parse(validNode)).toEqual(validNode);
    const minimalNode = {
      id: 'node_2',
      type: 'critic',
      label: 'Falsification critic',
      dataRef: 'rev_1',
    };
    expect(LineageNode.parse(minimalNode)).toEqual(minimalNode);
    expect(() => LineageNode.parse({ ...validNode, bogus: 1 })).toThrow();
    for (const k of NODE_REQUIRED) {
      const clone: Record<string, unknown> = { ...validNode };
      delete clone[k];
      expect(() => LineageNode.parse(clone), `missing node ${k}`).toThrow();
    }
    // dataRef is a non-empty opaque pointer (Q3); metrics? is record<string, number> (non-number rejected).
    expect(() => LineageNode.parse({ ...validNode, dataRef: '' })).toThrow();
    expect(() => LineageNode.parse({ ...validNode, metrics: { fitness: 'high' } })).toThrow();

    expect(LineageEdge.parse(validEdge)).toEqual(validEdge);
    const minimalEdge = { id: 'edge_2', source: 'node_1', target: 'node_2', type: 'reviewed_by' };
    expect(LineageEdge.parse(minimalEdge)).toEqual(minimalEdge);
    expect(() => LineageEdge.parse({ ...validEdge, bogus: 1 })).toThrow();
    for (const k of EDGE_REQUIRED) {
      const clone: Record<string, unknown> = { ...validEdge };
      delete clone[k];
      expect(() => LineageEdge.parse(clone), `missing edge ${k}`).toThrow();
    }
    // source/target/type are non-empty strings.
    expect(() => LineageEdge.parse({ ...validEdge, source: '' })).toThrow();
  });

  it('lineage_projection_storage_agnostic', () => {
    // spec(§10): the projection (and its nodes) carry NO physical-storage/Neo4j field — a strict shape
    // rejects one, so consumers depend on the abstract graph contract only, never on physical storage.
    // Statement-level safeParse (not a toThrow wrapper) so RED fails on the missing symbol and GREEN
    // passes on real strict rejection.
    expect(
      LineageGraphProjection.safeParse({ ...validProjection, neo4jNodeId: 'n123' }).success,
    ).toBe(false);
    expect(LineageNode.safeParse({ ...validNode, neo4jId: 'x' }).success).toBe(false);
  });
});
