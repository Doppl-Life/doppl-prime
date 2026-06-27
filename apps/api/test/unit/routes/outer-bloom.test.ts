import { describe, expect, test } from 'vitest';
import {
  collectOuterBloomSubtreeIds,
  filterOuterBloomIslandByHiddenRoots,
} from '../../../src/routes/outer-bloom';

describe('outer bloom route helpers', () => {
  test('collects a selected imported node and all descendants in stable depth-first order', () => {
    const rows = [
      { id: 'case', parentId: null },
      { id: 'problem-a', parentId: 'case' },
      { id: 'problem-b', parentId: 'case' },
      { id: 'doppl-a1', parentId: 'problem-a' },
      { id: 'doppl-a2', parentId: 'problem-a' },
      { id: 'doppl-b1', parentId: 'problem-b' },
    ];

    expect(collectOuterBloomSubtreeIds('problem-a', rows)).toEqual([
      'problem-a',
      'doppl-a1',
      'doppl-a2',
    ]);
    expect(collectOuterBloomSubtreeIds('case', rows)).toEqual([
      'case',
      'problem-a',
      'doppl-a1',
      'doppl-a2',
      'problem-b',
      'doppl-b1',
    ]);
  });

  test('returns an empty set for nodes outside the imported artifact table', () => {
    expect(
      collectOuterBloomSubtreeIds('live-event-node', [
        { id: 'case', parentId: null },
        { id: 'problem', parentId: 'case' },
      ]),
    ).toEqual([]);
  });

  test('filters hidden live-projection roots and their descendants from a visible island', () => {
    const island = {
      runId: 'run-live',
      seed: 'seed',
      status: 'running',
      sequenceThrough: 10,
      nodes: [
        node('case', null, 'case_study'),
        node('problem-a', 'case', 'problem_recovery'),
        node('problem-b', 'case', 'problem_recovery'),
        node('doppl-a1', 'problem-a', 'doppl'),
        node('doppl-b1', 'problem-b', 'doppl'),
      ],
      edges: [
        edge('case', 'problem-a'),
        edge('case', 'problem-b'),
        edge('problem-a', 'doppl-a1'),
        edge('problem-b', 'doppl-b1'),
      ],
    };

    const filtered = filterOuterBloomIslandByHiddenRoots(island, new Set(['problem-a']));

    expect(filtered?.nodes.map((n) => n.id)).toEqual(['case', 'problem-b', 'doppl-b1']);
    expect(filtered?.edges.map((e) => e.id)).toEqual(['case->problem-b', 'problem-b->doppl-b1']);
  });

  test('returns null when a hidden root removes the whole island', () => {
    const island = {
      runId: 'run-live',
      seed: 'seed',
      status: 'running',
      sequenceThrough: 10,
      nodes: [node('case', null, 'case_study'), node('problem', 'case', 'problem_recovery')],
      edges: [edge('case', 'problem')],
    };

    expect(filterOuterBloomIslandByHiddenRoots(island, new Set(['case']))).toBeNull();
  });

  test('terminates if corrupt imported parent links contain a cycle', () => {
    expect(
      collectOuterBloomSubtreeIds('a', [
        { id: 'a', parentId: 'b' },
        { id: 'b', parentId: 'a' },
      ]),
    ).toEqual(['a', 'b']);
  });
});

function node(
  id: string,
  parentId: string | null,
  stage: 'case_study' | 'problem_recovery' | 'doppl',
) {
  return {
    id,
    runId: 'run-live',
    stage,
    label: id,
    summary: id,
    status: 'created',
    parentId,
    generationIndex: null,
    score: null,
    novelty: null,
    judgeAcceptance: null,
    sourceId: null,
    agenomeId: null,
  };
}

function edge(source: string, target: string) {
  return {
    id: `${source}->${target}`,
    source,
    target,
    type: 'link',
  };
}
