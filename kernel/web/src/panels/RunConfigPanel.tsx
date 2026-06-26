import { type JSX, useState } from "react";
import { useRunStore } from "../state/runStore.js";
import {
  DEFAULT_FORM_STATE,
  type FormError,
  type RunConfigFormState,
  formToConfig,
} from "./runConfigForm.js";

/**
 * Operator run-config panel (P7.5). Edits RunConfig / RunCaps fields,
 * validates against the shared Zod schema + the local cap-max ceiling,
 * and submits the idempotent POST /runs command on success. A 409
 * response (active run exists) surfaces the active runId; the user can
 * click "Load active" to set it as the dashboard's current runId.
 */

export interface RunConfigPanelProps {
  /** Pre-generated key for tests; runtime defaults to crypto.randomUUID(). */
  idempotencyKeyFactory?: () => string;
}

interface ApiErrorBody {
  error?: string;
  activeRunId?: string;
  issues?: { path: (string | number)[]; message: string }[];
}

function errorsFor(path: (string | number)[], errors: FormError[]): string | null {
  const e = errors.find(
    (err) => err.path.length === path.length && err.path.every((p, i) => p === path[i]),
  );
  return e?.message ?? null;
}

export function RunConfigPanel(props: RunConfigPanelProps): JSX.Element {
  const { client, dispatch } = useRunStore();
  const [form, setForm] = useState<RunConfigFormState>(DEFAULT_FORM_STATE);
  const [errors, setErrors] = useState<FormError[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  function updateCaps<K extends keyof RunConfigFormState["caps"]>(
    key: K,
    value: RunConfigFormState["caps"][K],
  ) {
    setForm((f) => ({ ...f, caps: { ...f.caps, [key]: value } }));
  }

  async function handleSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setSubmitting(true);
    setServerError(null);
    setActiveRunId(null);
    const result = formToConfig(form);
    if (!result.ok) {
      setErrors(result.errors);
      setSubmitting(false);
      return;
    }
    setErrors([]);
    try {
      const idempotencyKey = (props.idempotencyKeyFactory ?? (() => crypto.randomUUID()))();
      const out = await client.startRun(result.config, { idempotencyKey });
      dispatch({ kind: "SET_RUN_ID", runId: out.runId });
    } catch (err) {
      const raw = (err as { body?: ApiErrorBody }).body;
      if (raw?.error === "run_already_active" && raw.activeRunId) {
        setActiveRunId(raw.activeRunId);
        setServerError(`A run is already active (${raw.activeRunId}).`);
      } else {
        setServerError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Run configuration"
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <fieldset style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <legend style={{ fontWeight: 700 }}>Identity</legend>
        <label>
          Operator seed
          <input
            type="text"
            value={form.seed}
            onChange={(e) => setForm((f) => ({ ...f, seed: e.target.value }))}
            required
          />
        </label>
        <label>
          RNG seed
          <input
            type="text"
            value={form.rngSeed}
            onChange={(e) => setForm((f) => ({ ...f, rngSeed: e.target.value }))}
            required
          />
        </label>
        <label>
          Model profile
          <input
            type="text"
            value={form.modelProfile}
            onChange={(e) => setForm((f) => ({ ...f, modelProfile: e.target.value }))}
          />
        </label>
        <label>
          Scoring policy version
          <input
            type="text"
            value={form.scoringPolicyVersion}
            onChange={(e) => setForm((f) => ({ ...f, scoringPolicyVersion: e.target.value }))}
          />
        </label>
      </fieldset>

      <fieldset style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <legend style={{ fontWeight: 700 }}>Enabled subtypes</legend>
        <label>
          <input
            type="checkbox"
            checked={form.enabledSubtypes.cross_domain_transfer}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                enabledSubtypes: { ...f.enabledSubtypes, cross_domain_transfer: e.target.checked },
              }))
            }
          />
          Cross-domain transfer
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.enabledSubtypes.zeitgeist_synthesis}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                enabledSubtypes: { ...f.enabledSubtypes, zeitgeist_synthesis: e.target.checked },
              }))
            }
          />
          Zeitgeist synthesis
        </label>
        {errorsFor(["enabledSubtypes"], errors) && (
          <span role="alert" style={{ color: "var(--doppl-status-error)" }}>
            {errorsFor(["enabledSubtypes"], errors)}
          </span>
        )}
      </fieldset>

      <fieldset style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <legend style={{ fontWeight: 700 }}>Caps (may lower within validated maxima)</legend>
        {(
          [
            ["maxPopulation", "Max population"],
            ["maxGenerations", "Max generations"],
            ["energyBudget", "Energy budget"],
            ["maxSpawnDepth", "Max spawn depth"],
            ["maxToolCalls", "Max tool calls"],
            ["wallClockTimeoutMs", "Wall-clock timeout (ms)"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              value={form.caps[key]}
              min={1}
              onChange={(e) => updateCaps(key, Number(e.target.value))}
              required
            />
            {errorsFor(["caps", key], errors) && (
              <span role="alert" style={{ color: "var(--doppl-status-error)", marginLeft: 8 }}>
                {errorsFor(["caps", key], errors)}
              </span>
            )}
          </label>
        ))}
      </fieldset>

      <button type="submit" disabled={submitting}>
        {submitting ? "Starting…" : "Start run"}
      </button>

      {serverError && (
        <div role="alert" style={{ color: "var(--doppl-status-error)" }}>
          {serverError}
          {activeRunId && (
            <button
              type="button"
              style={{ marginLeft: 8 }}
              onClick={() => dispatch({ kind: "SET_RUN_ID", runId: activeRunId })}
            >
              Load active
            </button>
          )}
        </div>
      )}
    </form>
  );
}
