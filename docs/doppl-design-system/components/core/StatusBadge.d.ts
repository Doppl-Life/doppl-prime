import * as React from "react";

export type StatusDomain = "agenome" | "candidate" | "check" | "run" | "subtype";

/**
 * The atomic status token — shape + icon + label + color, never color alone.
 * Colorblind-safe and projector-legible; used on every node, card, and inspector.
 */
export interface StatusBadgeProps {
  /** Which lifecycle family the status belongs to. */
  domain?: StatusDomain;
  /** Canonical status string for that domain (e.g. "eligible_parent", "under_review", "skipped"). */
  status: string;
  /** sm = dense graph nodes, md = default, lg = projector / RunHeader. */
  size?: "sm" | "md" | "lg";
  /** Hide the text label (icon-only, e.g. dense graph nodes). Label still in the tooltip. */
  showLabel?: boolean;
  /** Force the breathing pulse on/off. Defaults to the status' own liveness (active / under_review). */
  pulse?: boolean;
  /** For check `skipped` / agenome `failed` — the reason rendered after the label. */
  reason?: string;
}

export function StatusBadge(props: StatusBadgeProps): React.JSX.Element;
