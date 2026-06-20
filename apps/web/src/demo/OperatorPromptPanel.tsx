import { type JSX, useEffect, useState } from "react";
import type { CuratedPrompt, DemoLiveRequest } from "../data/runClient.js";
import { useRunStore } from "../state/runStore.js";

/**
 * OperatorPromptPanel (PD.5 / U9). The audience-visible "Start a demo
 * run" control. Two modes:
 *
 *   1. Prepared: dropdown of curated problems (loaded from
 *      GET /demo/curated-prompts). Submit → POST /demo/runs/live with
 *      { problemId }.
 *
 *   2. Operator: a free-text textarea. Submit → POST /demo/runs/live
 *      with { operatorPrompt }. Empty / whitespace-only prompts are
 *      blocked at the seam with an inline error; the server's
 *      EmptyPromptError is the structural safety net.
 *
 * The candidate-as-DATA isolation seam (Phase 4) means prompt content
 * cannot move scoring — no client-side sanitization needed. Cap
 * overrides flow through the existing applyDemoOverride pipeline; the
 * panel surfaces maxPopulation + maxGenerations so the operator can
 * tighten the demo loop visually.
 */

type PromptMode = "prepared" | "operator";

export interface OperatorPromptPanelProps {
  /** Test seam — supplied prompts skip the GET fetch. */
  initialPrompts?: CuratedPrompt[];
}

export function OperatorPromptPanel(props: OperatorPromptPanelProps): JSX.Element {
  const { client, dispatch } = useRunStore();
  const [mode, setMode] = useState<PromptMode>("prepared");
  const [prompts, setPrompts] = useState<CuratedPrompt[]>(props.initialPrompts ?? []);
  const [selectedId, setSelectedId] = useState<string>(props.initialPrompts?.[0]?.id ?? "");
  const [operatorPrompt, setOperatorPrompt] = useState("");
  const [maxPopulation, setMaxPopulation] = useState<string>("");
  const [maxGenerations, setMaxGenerations] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (props.initialPrompts !== undefined) return;
    let cancelled = false;
    void client
      .getCuratedPrompts()
      .then((next) => {
        if (cancelled) return;
        setPrompts(next);
        if (next.length > 0 && selectedId === "") setSelectedId(next[0]?.id ?? "");
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client, props.initialPrompts, selectedId]);

  const trimmedPrompt = operatorPrompt.trim();
  const canSubmit =
    !submitting && (mode === "prepared" ? selectedId !== "" : trimmedPrompt.length > 0);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setWarnings([]);
    if (mode === "operator" && trimmedPrompt.length === 0) {
      setError("Prompt cannot be empty.");
      return;
    }
    setSubmitting(true);
    try {
      const capOverride: NonNullable<DemoLiveRequest["capOverride"]> = {};
      const mp = Number.parseInt(maxPopulation, 10);
      if (Number.isInteger(mp) && mp > 0) capOverride.maxPopulation = mp;
      const mg = Number.parseInt(maxGenerations, 10);
      if (Number.isInteger(mg) && mg > 0) capOverride.maxGenerations = mg;

      const body: DemoLiveRequest =
        mode === "prepared"
          ? {
              problemId: selectedId,
              ...(Object.keys(capOverride).length > 0 ? { capOverride } : {}),
            }
          : {
              operatorPrompt: trimmedPrompt,
              ...(Object.keys(capOverride).length > 0 ? { capOverride } : {}),
            };
      const result = await client.startDemoLive(body);
      dispatch({ kind: "SET_RUN_ID", runId: result.runId });
      setWarnings(result.warnings);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      aria-label="Operator demo controls"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <h3 style={{ fontSize: 16, margin: 0 }}>Demo controls</h3>
      <fieldset style={{ border: "none", padding: 0, display: "flex", gap: 12 }}>
        <label>
          <input
            type="radio"
            name="prompt-mode"
            value="prepared"
            checked={mode === "prepared"}
            onChange={() => setMode("prepared")}
          />{" "}
          Prepared
        </label>
        <label>
          <input
            type="radio"
            name="prompt-mode"
            value="operator"
            checked={mode === "operator"}
            onChange={() => setMode("operator")}
          />{" "}
          Custom prompt
        </label>
      </fieldset>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {mode === "prepared" ? (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>Curated problem</span>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              aria-label="Curated problem"
            >
              {prompts.length === 0 && <option value="">No curated prompts available</option>}
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>Operator prompt</span>
            <textarea
              rows={4}
              value={operatorPrompt}
              onChange={(e) => setOperatorPrompt(e.target.value)}
              aria-label="Operator prompt"
              placeholder="Describe the problem to solve…"
            />
          </label>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label>
            <span style={{ fontSize: 13 }}>maxPopulation override</span>
            <input
              type="number"
              min={1}
              max={16}
              value={maxPopulation}
              onChange={(e) => setMaxPopulation(e.target.value)}
              aria-label="maxPopulation override"
              style={{ width: "100%" }}
            />
          </label>
          <label>
            <span style={{ fontSize: 13 }}>maxGenerations override</span>
            <input
              type="number"
              min={1}
              max={12}
              value={maxGenerations}
              onChange={(e) => setMaxGenerations(e.target.value)}
              aria-label="maxGenerations override"
              style={{ width: "100%" }}
            />
          </label>
        </div>
        <button type="submit" disabled={!canSubmit} aria-label="Start demo run">
          {submitting ? "Starting…" : "Start"}
        </button>
        {error && (
          <p role="alert" style={{ color: "var(--doppl-status-error)", fontSize: 13 }}>
            {error}
          </p>
        )}
        {warnings.length > 0 && (
          <ul
            data-testid="operator-warnings"
            style={{ color: "var(--doppl-status-warning, #b07a00)", fontSize: 13 }}
          >
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </form>
    </section>
  );
}
