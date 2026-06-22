import type { JSX } from "react";
import { Handle, type NodeProps, Position } from "reactflow";
import { StatusIndicator } from "../ui/StatusIndicator.js";
import type { StatusDomain } from "../ui/status-map.js";

/**
 * Five custom React Flow node components (P7.7) — one per
 * LineageNodeType enum value. Each uses the shared StatusIndicator
 * primitive so the same status reads identically across the graph and
 * the panel rail.
 */

interface NodeShellProps {
  label: string;
  kind: string;
  rawId?: string | undefined;
  status?: string | undefined;
  domain: StatusDomain;
  metric?: { label: string; value: number | string } | undefined;
  borderColor?: string | undefined;
  /** Overrides the default 2px border. Survivor candidate nodes use a
   *  thicker border so green pops at a scan-distance. */
  borderWidth?: number | undefined;
  /** Optional tint behind the node (e.g. a faint green wash on high-
   *  fitness candidates). Layers under the default surface color. */
  tintColor?: string | undefined;
  /** Larger font for the metric value. Used to make fitness numbers
   *  more scannable on candidate nodes. */
  metricEmphasis?: boolean | undefined;
}

function NodeShell({
  label,
  kind,
  rawId,
  status,
  domain,
  metric,
  borderColor,
  borderWidth,
  tintColor,
  metricEmphasis,
}: NodeShellProps): JSX.Element {
  return (
    <div
      style={{
        background: tintColor ?? "var(--doppl-bg-elevated)",
        border: `${borderWidth ?? 2}px solid ${borderColor ?? "var(--doppl-border)"}`,
        borderRadius: "var(--doppl-radius)",
        padding: "var(--doppl-sp-3)",
        minWidth: 160,
        fontSize: 14,
        color: "var(--doppl-text-primary)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
      title={rawId ? `${kind} · ${rawId}` : kind}
    >
      <Handle type="target" position={Position.Left} />
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--doppl-text-secondary)",
        }}
      >
        {kind}
      </div>
      <div style={{ fontWeight: 700 }}>{label}</div>
      {status && <StatusIndicator domain={domain} status={status} size="sm" />}
      {metric && (
        <div
          style={{
            fontSize: metricEmphasis ? 15 : 12,
            fontWeight: metricEmphasis ? 700 : 400,
            color: metricEmphasis
              ? "var(--doppl-text-primary)"
              : "var(--doppl-text-secondary)",
          }}
        >
          {metric.label}:{" "}
          {typeof metric.value === "number" ? metric.value.toFixed(2) : metric.value}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

interface LineageNodeData {
  label: string;
  rawId?: string;
  status?: string;
  metrics?: Record<string, number>;
  /** Candidate-only: fitness total projected from the run's scoring
   *  node. Used to render an inline metric and to band the border
   *  color so "which ideas survived" reads at a glance. */
  fitness?: number;
}

export function AgenomeNode(props: NodeProps<LineageNodeData>): JSX.Element {
  return (
    <NodeShell
      kind="Agent"
      rawId={props.data.rawId}
      label={props.data.label}
      status={props.data.status}
      domain="agenome"
      borderColor="var(--doppl-status-info)"
    />
  );
}

/**
 * Three-band fitness treatment so the lineage graph reads at a glance:
 *   green ≥ 0.7 → "survived well": thicker border + faint green tint
 *   amber ≥ 0.4 → "marginal":      default border weight + faint amber tint
 *   dim   < 0.4 or undefined: default border + no tint
 *
 * Hard thresholds are deliberate — a continuous gradient was harder
 * to scan and made every node look slightly different. The tint is
 * intentionally faint so the node still reads as the same shape
 * across bands; the border + metric carry the contrast.
 */
function fitnessVisual(fitness: number | undefined): {
  borderColor: string;
  borderWidth: number;
  tintColor: string | undefined;
} {
  if (fitness === undefined) {
    return { borderColor: "var(--doppl-status-pending)", borderWidth: 2, tintColor: undefined };
  }
  if (fitness >= 0.7) {
    return {
      borderColor: "var(--doppl-status-ok)",
      borderWidth: 4,
      tintColor: "rgba(34, 197, 94, 0.08)",
    };
  }
  if (fitness >= 0.4) {
    return {
      borderColor: "var(--doppl-status-warn)",
      borderWidth: 2,
      tintColor: "rgba(250, 204, 21, 0.06)",
    };
  }
  return { borderColor: "var(--doppl-status-pending)", borderWidth: 2, tintColor: undefined };
}

export function CandidateNode(props: NodeProps<LineageNodeData>): JSX.Element {
  const { fitness } = props.data;
  const visual = fitnessVisual(fitness);
  return (
    <NodeShell
      kind="Idea"
      rawId={props.data.rawId}
      label={props.data.label}
      status={props.data.status}
      domain="candidate"
      metric={fitness !== undefined ? { label: "fitness", value: fitness } : undefined}
      metricEmphasis={fitness !== undefined}
      borderColor={visual.borderColor}
      borderWidth={visual.borderWidth}
      tintColor={visual.tintColor}
    />
  );
}

export function CriticReviewNode(props: NodeProps<LineageNodeData>): JSX.Element {
  const confidence = props.data.metrics?.confidence;
  return (
    <NodeShell
      kind="Critic"
      rawId={props.data.rawId}
      label={props.data.label}
      domain="critic_review"
      status="accepted"
      metric={confidence !== undefined ? { label: "confidence", value: confidence } : undefined}
      borderColor="var(--doppl-status-warn)"
    />
  );
}

export function CheckResultNode(props: NodeProps<LineageNodeData>): JSX.Element {
  const score = props.data.metrics?.score;
  return (
    <NodeShell
      kind="Check"
      rawId={props.data.rawId}
      label={props.data.label}
      status={props.data.status}
      domain="check"
      metric={score !== undefined ? { label: "score", value: score } : undefined}
      borderColor="var(--doppl-status-skip)"
    />
  );
}

export function ScoringNode(props: NodeProps<LineageNodeData>): JSX.Element {
  const total = props.data.metrics?.total;
  return (
    <NodeShell
      kind="Score"
      rawId={props.data.rawId}
      label={props.data.label}
      domain="candidate"
      status="scored"
      metric={total !== undefined ? { label: "total", value: total } : undefined}
      borderColor="var(--doppl-status-ok)"
    />
  );
}

export const nodeTypes = {
  agenome: AgenomeNode,
  candidate: CandidateNode,
  critic_review: CriticReviewNode,
  check_result: CheckResultNode,
  scoring: ScoringNode,
};
