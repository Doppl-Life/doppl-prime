import * as React from "react";

/** No data yet (pre-Gen-0 graph, no events, no candidates). */
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Operator-only CTA (e.g. a <Button>). */
  action?: React.ReactNode;
}
export function EmptyState(props: EmptyStateProps): React.JSX.Element;

/** Data in flight — skeletons matching the target layout (less jarring on a projector). */
export interface LoadingStateProps {
  shape?: "graph" | "card" | "chart" | "inspector" | "inline";
  label?: string;
}
export function LoadingState(props: LoadingStateProps): React.JSX.Element;

/** A recoverable failure — fetch failed, stream lost, provider unavailable. */
export interface ErrorStateProps {
  title?: string;
  detail?: string;
  onRetry?: () => void;
  /** Secondary action (e.g. "Switch to replay"). */
  action?: React.ReactNode;
  severity?: "recoverable" | "fatal";
}
export function ErrorState(props: ErrorStateProps): React.JSX.Element;

/** The run continues but evidence is partial — the honest-degradation surface. */
export interface DegradedStateProps {
  kind?: "novelty_degraded" | "langfuse_off" | "provider_failure" | "all_culled";
  detail?: string;
}
export function DegradedState(props: DegradedStateProps): React.JSX.Element;
