import type { JSX } from "react";
import { useRunState } from "../state/runStore.js";

/**
 * Problem banner. Surfaces the actual question we asked the run — the
 * curated prompt's title + body, or the operator's typed text. Sits at
 * the top of the dashboard so the rest of the view (lineage, fitness,
 * candidates) is grounded in "what was the question?".
 *
 * Rendered nowhere when there's no run loaded.
 */
export function ProblemBanner(): JSX.Element | null {
  const state = useRunState();
  if (!state.runId) return null;

  const title = state.run?.problemTitle ?? null;
  const body = state.run?.problemText ?? null;
  // Fallback: older runs that pre-date the schema field have only `seed`.
  // For curated runs the seed is `demo-prepared-<id>` — strip the prefix
  // so at least *something* readable appears.
  const fallbackTitle =
    title ??
    (state.run?.seed?.startsWith("demo-prepared-")
      ? state.run.seed.replace(/^demo-prepared-/, "").replace(/-/g, " ")
      : state.run?.seed ?? null);

  if (!fallbackTitle && !body) return null;

  return (
    <section
      aria-label="Problem"
      style={{
        background: "var(--doppl-bg-elevated)",
        border: "1px solid var(--doppl-border)",
        borderLeft: "4px solid var(--doppl-cyan, var(--doppl-status-info))",
        borderRadius: 8,
        padding: "12px 16px",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--doppl-text-secondary)",
          marginBottom: 4,
        }}
      >
        Problem
      </div>
      {fallbackTitle && (
        <div
          style={{
            fontSize: "var(--doppl-fs-lg, 18px)",
            fontWeight: 700,
            color: "var(--doppl-text-primary)",
            marginBottom: body ? 6 : 0,
          }}
        >
          {fallbackTitle}
        </div>
      )}
      {body && (
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            color: "var(--doppl-text-primary)",
            maxWidth: "78ch",
          }}
        >
          {body}
        </div>
      )}
    </section>
  );
}
