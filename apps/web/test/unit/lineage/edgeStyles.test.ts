import { describe, expect, it } from 'vitest';
import { MarkerType } from '@xyflow/react';
import type { EdgeMarker } from '@xyflow/react';
import { edgeStyleFor } from '../../../src/lineage/edgeStyles';

describe('edgeStyles — projection edge type → React Flow edge visual', () => {
  // spec(§8/§3 + §12): a single-parent mutation edge reads as dashed, amber, animated, with an amber
  // arrowhead — visually distinct from the plumbing backbone.
  it('test_mutation_only_is_dashed_amber_animated', () => {
    const v = edgeStyleFor('mutation_only');
    expect(v.style.stroke).toBe('var(--status-mutated)');
    expect(v.style.strokeDasharray).toBeTruthy();
    expect(v.animated).toBe(true);
    expect((v.markerEnd as EdgeMarker).type).toBe(MarkerType.ArrowClosed);
    expect((v.markerEnd as EdgeMarker).color).toBe('var(--status-mutated)');
  });

  // spec(§8/§3): every fusion-family mode (fusion · crossover · output_synthesis) reads as a SOLID,
  // thick, violet, animated edge with a violet arrowhead.
  it.each(['fusion', 'crossover', 'output_synthesis'])(
    'test_fusion_family_is_solid_violet (%s)',
    (mode) => {
      const v = edgeStyleFor(mode);
      expect(v.style.stroke).toBe('var(--status-reproduced)');
      expect(v.style.strokeDasharray).toBeUndefined(); // solid, not dashed
      expect(v.animated).toBe(true);
      expect((v.markerEnd as EdgeMarker).color).toBe('var(--status-reproduced)');
    },
  );

  // spec(§12): a `generated` (agenome → candidate) derivation edge is a faint strong-border line, no
  // arrow marker, not animated — it is plumbing, not a breeding event.
  it('test_generated_is_faint_derivation', () => {
    const v = edgeStyleFor('generated');
    expect(v.style.stroke).toBe('var(--border-strong, var(--border-subtle))');
    expect(v.markerEnd).toBeUndefined();
    expect(v.animated).toBeUndefined();
  });

  // spec(§12): a `spawned` (generation → agenome) edge is the faintest dotted backbone line.
  it('test_spawned_is_faint_dotted', () => {
    const v = edgeStyleFor('spawned');
    expect(v.style.stroke).toBe('var(--border-subtle)');
    expect(v.style.strokeDasharray).toBeTruthy();
  });

  // spec(§12): an unknown edge type falls back to the faint default (never throws, never blank).
  it('test_unknown_type_falls_back_to_default', () => {
    const v = edgeStyleFor('totally_unknown_relation');
    expect(v.style.stroke).toBe('var(--border-subtle)');
    expect(v.style.strokeDasharray).toBeUndefined();
    expect(v.markerEnd).toBeUndefined();
    expect(v.animated).toBeUndefined();
  });
});
