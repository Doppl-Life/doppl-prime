import { describe, expect, it } from 'vitest';
import { loadStaticKnowledgeGraph } from '../../../src/data/staticKnowledge';

describe('loadStaticKnowledgeGraph', () => {
  it('derives the When the Crashes knowledge fallback from the checked-in Agarden source', async () => {
    const graph = await loadStaticKnowledgeGraph('when-the-crashes-dont-come-575845a4');

    expect(graph).not.toBeNull();
    expect(graph?.runId).toBe('when-the-crashes-dont-come-575845a4');
    expect(Object.values(graph?.state.notes ?? {}).length).toBeGreaterThan(40);
    expect(
      Object.values(graph?.state.notes ?? {}).some((note) => note.query?.includes('case study') === true),
    ).toBe(true);
    expect(
      Object.values(graph?.state.notes ?? {}).some((note) =>
        note.query?.includes('Actuarial Collapse in Specialty Auto Reinsurance') === true,
      ),
    ).toBe(true);
    expect(Object.values(graph?.state.edges ?? {}).some((edge) => edge.type === 'retrieved')).toBe(
      true,
    );
  });

  it('returns null for runs absent from the checked-in calibration index', async () => {
    await expect(loadStaticKnowledgeGraph('not-a-known-static-run')).resolves.toBeNull();
  });
});
