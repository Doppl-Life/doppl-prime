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
}

function NodeShell({
  label,
  kind,
  rawId,
  status,
  domain,
  metric,
  borderColor,
}: NodeShellProps): JSX.Element {
  return (
    <div
      style={{
        background: "var(--doppl-bg-elevated)",
        border: `2px solid ${borderColor ?? "var(--doppl-border)"}`,
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
        <div style={{ fontSize: 12, color: "var(--doppl-text-secondary)" }}>
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

export function CandidateNode(props: NodeProps<LineageNodeData>): JSX.Element {
  return (
    <NodeShell
      kind="Idea"
      rawId={props.data.rawId}
      label={props.data.label}
      status={props.data.status}
      domain="candidate"
      borderColor="var(--doppl-status-pending)"
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
