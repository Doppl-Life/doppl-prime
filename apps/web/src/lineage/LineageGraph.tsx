import { type JSX, useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import type { LineageGraphProjectionT } from "../data/contracts.js";
import { useRunStore } from "../state/runStore.js";
import { layoutGraph } from "./layout.js";
import { nodeTypes } from "./nodeTypes.js";

/**
 * LineageGraph (P7.7). Consumes the lineage projection (loaded on
 * mount + refreshed when sequenceThrough advances) and renders five
 * custom node types via Dagre-positioned React Flow.
 *
 * The projection is fetched from GET /runs/:id/lineage; live SSE
 * updates are reflected by re-fetching on sequenceThrough change.
 * For a more incremental future, the projection could be folded
 * client-side from candidate/agenome events — out of scope for MVP.
 */

interface ProjectionState {
  projection: LineageGraphProjectionT | null;
  loading: boolean;
  error: string | null;
}

export function LineageGraph(): JSX.Element {
  const { state, client, dispatch } = useRunStore();
  const [{ projection, loading, error }, setState] = useState<ProjectionState>({
    projection: null,
    loading: false,
    error: null,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: state.sequenceThrough deliberately included so live SSE updates refetch the lineage projection
  useEffect(() => {
    if (!state.runId) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    void client
      .getLineage(state.runId)
      .then((projection) => {
        if (!cancelled) setState({ projection, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          projection: null,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [state.runId, state.sequenceThrough, client]);

  const { rfNodes, rfEdges } = useMemo<{ rfNodes: Node[]; rfEdges: Edge[] }>(() => {
    if (!projection) return { rfNodes: [], rfEdges: [] };
    const laid = layoutGraph(
      projection.nodes.map((n) => ({ id: n.id, type: n.type })),
      projection.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    );
    const rfNodes: Node[] = laid.nodes.map((node) => {
      const orig = projection.nodes.find((n) => n.id === node.id);
      return {
        id: node.id,
        type: orig?.type ?? "agenome",
        position: node.position,
        data: {
          label: orig?.label ?? node.id,
          status: orig?.status,
          metrics: orig?.metrics,
        },
      };
    });
    const rfEdges: Edge[] = laid.edges.map((e) => {
      const orig = projection.edges.find((eo) => eo.id === e.id);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        label: orig?.label,
      };
    });
    return { rfNodes, rfEdges };
  }, [projection]);

  if (!state.runId) {
    return <div style={{ padding: 24, color: "var(--doppl-text-secondary)" }}>No run loaded.</div>;
  }
  if (error) {
    return (
      <div role="alert" style={{ padding: 24, color: "var(--doppl-status-error)" }}>
        Lineage error: {error}
      </div>
    );
  }
  if (loading && !projection) {
    return <div style={{ padding: 24 }}>Loading lineage…</div>;
  }
  if (!projection || projection.nodes.length === 0) {
    return (
      <div style={{ padding: 24, color: "var(--doppl-text-secondary)" }}>
        No lineage yet. Events will appear as generations spawn candidates.
      </div>
    );
  }
  return (
    <div style={{ height: "100%", width: "100%" }} aria-label="Lineage graph">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => {
          if (node.type === "candidate") {
            dispatch({ kind: "SELECT_CANDIDATE", candidateId: node.id });
          } else if (node.type === "agenome") {
            dispatch({ kind: "SELECT_AGENOME", agenomeId: node.id });
          }
        }}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
