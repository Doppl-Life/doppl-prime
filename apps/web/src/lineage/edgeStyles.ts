import { MarkerType } from '@xyflow/react';
import type { EdgeMarkerType } from '@xyflow/react';
import type { CSSProperties } from 'react';

/**
 * edgeStyles — the PURE map from a projection edge `type` to its React Flow edge visuals (stroke /
 * width / dash / arrow marker / animation). The point of the redesign: a non-expert must read the
 * EVOLUTION at a glance — reproduction edges (the breeding events the organism is judged on) are made
 * visually loud + distinct from the plumbing edges (spawned/generated), and color is NEVER the only
 * channel (dash pattern + width + animation co-encode):
 *   - `mutation_only`   → amber, dashed, animated + amber arrow   (single-parent mutation)
 *   - fusion family     → violet, thick, solid, animated + violet arrow  (two-parent fusion)
 *     (`fusion` | `crossover` | `output_synthesis` — the ReproductionMode breeding modes, §8/§3)
 *   - `generated`       → faint strong-border derivation (agenome → candidate)
 *   - `spawned`         → faintest dotted (generation → agenome backbone)
 *   - anything else     → the faint default
 * Tokens only — colors are `var(--token)` strings (no raw hex); the numbers here are stroke GEOMETRY,
 * not styling tokens (same exemption the layout coordinates carry).
 */

/** The fusion-family edge types (the §8/§3 ReproductionMode two-parent breeding modes). */
const FUSION_TYPES: ReadonlySet<string> = new Set(['fusion', 'crossover', 'output_synthesis']);

export interface EdgeVisual {
  readonly style: CSSProperties;
  readonly markerEnd?: EdgeMarkerType;
  readonly animated?: boolean;
}

/** The gold connector from the producing agenome to the SELECTED WINNER in its right-hand lane — the one
 *  line that traces the run's final result back into the lineage. Loud + gold so the winning path stands out. */
export const WINNER_EDGE_VISUAL: EdgeVisual = {
  style: { stroke: 'var(--status-selected)', strokeWidth: 2.5 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: 'var(--status-selected)',
    width: 22,
    height: 22,
  },
};

/** A violet (reproduced/fusion) closed arrowhead — co-colored with its stroke. Enlarged so the DESTINATION
 *  end of a breeding line is obvious at a glance (a two-parent fusion converges several lines on a child). */
const FUSION_MARKER: EdgeMarkerType = {
  type: MarkerType.ArrowClosed,
  color: 'var(--status-reproduced)',
  width: 20,
  height: 20,
};
/** An orange (mutation) closed arrowhead — co-colored with its stroke. */
const MUTATION_MARKER: EdgeMarkerType = {
  type: MarkerType.ArrowClosed,
  color: 'var(--status-mutated)',
  width: 20,
  height: 20,
};

export function edgeStyleFor(type: string): EdgeVisual {
  if (type === 'mutation_only') {
    return {
      style: { stroke: 'var(--status-mutated)', strokeWidth: 2, strokeDasharray: '6 4' },
      markerEnd: MUTATION_MARKER,
      animated: true,
    };
  }
  if (FUSION_TYPES.has(type)) {
    return {
      style: { stroke: 'var(--status-reproduced)', strokeWidth: 2.5 },
      markerEnd: FUSION_MARKER,
      animated: true,
    };
  }
  if (type === 'generated') {
    return {
      style: { stroke: 'var(--border-strong, var(--border-subtle))', strokeWidth: 1.5 },
    };
  }
  if (type === 'spawned') {
    return {
      style: { stroke: 'var(--border-subtle)', strokeWidth: 1, strokeDasharray: '2 4' },
    };
  }
  return { style: { stroke: 'var(--border-subtle)', strokeWidth: 1 } };
}
