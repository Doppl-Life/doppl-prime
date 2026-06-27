import { describe, expect, test } from 'vitest';
import { collectOuterBloomSubtreeIds } from '../../../src/routes/outer-bloom';

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

  test('terminates if corrupt imported parent links contain a cycle', () => {
    expect(
      collectOuterBloomSubtreeIds('a', [
        { id: 'a', parentId: 'b' },
        { id: 'b', parentId: 'a' },
      ]),
    ).toEqual(['a', 'b']);
  });
});
