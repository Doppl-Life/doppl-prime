// P0.15(partial)+P0.13 — §2.5 cross-track schema-snapshot gate for the run-lifecycle entities + the
// lineage projection. spec(§3) spec(§8) spec(§10) spec(§2.5): each field-set + every closed union
// (RunStatus 8, GenerationStatus 9, LineageNodeType 6) == frozen snapshot — an added/removed/renamed
// field or union member on any of these four §2.5-seam contracts is caught here before tracks fork.
import { describe, it, expect } from 'vitest';
import {
  Run,
  RunStatus,
  Generation,
  GenerationStatus,
  CullingEvent,
  LineageGraphProjection,
  LineageNode,
  LineageNodeType,
  LineageEdge,
} from '@doppl/contracts';

const RUN_FIELD_SNAPSHOT = [
  'id',
  'seed',
  'enabledSubtypes',
  'caps',
  'status',
  'startedAt',
  'completedAt',
];

const RUN_STATUS_SNAPSHOT = [
  'configured',
  'running',
  'completing',
  'completed',
  'stopping',
  'stopped',
  'failed',
  'cancelled',
];

const GENERATION_FIELD_SNAPSHOT = ['id', 'runId', 'index', 'status', 'startedAt', 'completedAt'];

const GENERATION_STATUS_SNAPSHOT = [
  'pending',
  'running',
  'degraded', // [P0.15-amend] §3 running→degraded→verifying partial-failure edge (kernel-020: folds to schemaVersion 4)
  'verifying',
  'scoring',
  'reproducing',
  'completed',
  'failed',
  'skipped',
];

const CULLING_FIELD_SNAPSHOT = [
  'id',
  'runId',
  'generationId',
  'targetIds',
  'reason',
  'scoreSnapshot',
];

const PROJECTION_FIELD_SNAPSHOT = ['runId', 'nodes', 'edges', 'sequenceThrough'];

const NODE_FIELD_SNAPSHOT = ['id', 'type', 'label', 'status', 'metrics', 'dataRef'];

const NODE_TYPE_SNAPSHOT = ['generation', 'agenome', 'candidate', 'critic', 'check', 'score'];

const EDGE_FIELD_SNAPSHOT = ['id', 'source', 'target', 'type', 'label'];

const sorted = (a: readonly string[]): string[] => [...a].sort();

describe('schema snapshot — entities + lineage projection (spec §3 / §8 / §10 / §2.5)', () => {
  it('barrel_exports_entities_lineage', () => {
    // spec(§2.5): the public surface re-exports all four schemas + their three enums from one barrel.
    expect(typeof Run.parse).toBe('function');
    expect(typeof RunStatus.parse).toBe('function');
    expect(typeof Generation.parse).toBe('function');
    expect(typeof GenerationStatus.parse).toBe('function');
    expect(typeof CullingEvent.parse).toBe('function');
    expect(typeof LineageGraphProjection.parse).toBe('function');
    expect(typeof LineageNode.parse).toBe('function');
    expect(typeof LineageNodeType.parse).toBe('function');
    expect(typeof LineageEdge.parse).toBe('function');
  });

  it('schema_snapshot_entities_lineage', () => {
    expect(sorted(Object.keys(Run.shape))).toEqual(sorted(RUN_FIELD_SNAPSHOT));
    expect(sorted(RunStatus.options)).toEqual(sorted(RUN_STATUS_SNAPSHOT));
    expect(sorted(Object.keys(Generation.shape))).toEqual(sorted(GENERATION_FIELD_SNAPSHOT));
    expect(sorted(GenerationStatus.options)).toEqual(sorted(GENERATION_STATUS_SNAPSHOT));
    expect(sorted(Object.keys(CullingEvent.shape))).toEqual(sorted(CULLING_FIELD_SNAPSHOT));
    expect(sorted(Object.keys(LineageGraphProjection.shape))).toEqual(
      sorted(PROJECTION_FIELD_SNAPSHOT),
    );
    expect(sorted(Object.keys(LineageNode.shape))).toEqual(sorted(NODE_FIELD_SNAPSHOT));
    expect(sorted(LineageNodeType.options)).toEqual(sorted(NODE_TYPE_SNAPSHOT));
    expect(sorted(Object.keys(LineageEdge.shape))).toEqual(sorted(EDGE_FIELD_SNAPSHOT));

    expect(RUN_FIELD_SNAPSHOT).toHaveLength(7);
    expect(RUN_STATUS_SNAPSHOT).toHaveLength(8);
    expect(GENERATION_FIELD_SNAPSHOT).toHaveLength(6);
    expect(GENERATION_STATUS_SNAPSHOT).toHaveLength(9); // [P0.15-amend] 8→9 (+degraded)
    expect(CULLING_FIELD_SNAPSHOT).toHaveLength(6);
    expect(PROJECTION_FIELD_SNAPSHOT).toHaveLength(4);
    expect(NODE_FIELD_SNAPSHOT).toHaveLength(6);
    expect(NODE_TYPE_SNAPSHOT).toHaveLength(6);
    expect(EDGE_FIELD_SNAPSHOT).toHaveLength(5);
  });
});
