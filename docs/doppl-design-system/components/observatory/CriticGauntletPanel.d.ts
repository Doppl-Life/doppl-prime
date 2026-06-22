import * as React from "react";

export interface CriticReviewRow {
  /** Closed CriticMandate union. */
  mandate: "factual_grounding" | "novelty_prior_art" | "feasibility" | "falsification" | "subtype_specific";
  /** 0..1 — omit (null/undefined) to render the live "reviewing…" pulse. */
  score?: number | null;
  /** 0..1 */
  confidence?: number;
  critique?: string;
  evidenceRefs?: string[];
}

/**
 * The adversarial gauntlet a candidate faces: one row per critic mandate (evidence
 * only — critics never pick winners) plus the held-out JUDGE row, the frozen
 * immutable-to-agents anchor that decides "gen N+1 beats gen N".
 */
export interface CriticGauntletPanelProps {
  reviews: CriticReviewRow[];
  /** The held-out judge acceptance (0..1) + optional axes — rendered as the gold anchor row. */
  judge?: { acceptance: number; axes?: Record<string, number> };
  title?: string;
  mode?: "live" | "replay";
}
export function CriticGauntletPanel(props: CriticGauntletPanelProps): React.JSX.Element;
