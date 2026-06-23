import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { RunClient, StartRunResult } from '../../data/runClient';
import type { ProblemSet } from '../../data/operatorPromptClient';
import {
  DEFAULT_OPERATOR_PROMPT_FORM,
  validateOperatorPrompt,
  type OperatorPromptFormValues,
} from './operatorPromptForm';

/**
 * OperatorPromptPanel (PD.5b, ARCHITECTURE.md §12/§17) — the demo operator-prompt UI. On mount it fetches
 * the prepared-problem catalog (GET /problem-sets); the operator picks a prepared problem (dropdown) OR
 * types a freeform prompt (textarea); submit resolves the chosen `seed` and starts a demo run by POSTing
 * the PARTIAL `{ seed }` through the existing write path (`runClient.startDemoRun` → POST /runs; the api
 * deep-merges defaults, PD.10 isolates the seed). On start it hands the run to the shell via `onStarted`
 * (the shell wires the live SSE/lineage/health view). Read-only except the one POST /runs command (rule
 * #2); no direct fetch (injected runClient), no apps/api import, no secret. Errors are accessible
 * (`role="alert"`, labeled inputs — projector-legible).
 */
export interface OperatorPromptPanelProps {
  runClient: Pick<RunClient, 'getProblemSets' | 'startDemoRun'>;
  onStarted?: (run: StartRunResult) => void;
}

const field: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-1)',
  marginBottom: 'var(--space-4)',
};
const labelText: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-muted)',
};
const control: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-mono)',
  color: 'var(--fg-default)',
  background: 'var(--bg-surface)',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2)',
};
const errorText: CSSProperties = {
  color: 'var(--danger)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-caption)',
};

export function OperatorPromptPanel({ runClient, onStarted }: OperatorPromptPanelProps) {
  const [problemSets, setProblemSets] = useState<ProblemSet[]>([]);
  const [form, setForm] = useState<OperatorPromptFormValues>(DEFAULT_OPERATOR_PROMPT_FORM);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startedRun, setStartedRun] = useState<StartRunResult | null>(null);

  // Fetch the prepared-problem catalog on mount (read-only; a fetch failure is shown, never thrown).
  useEffect(() => {
    let active = true;
    runClient
      .getProblemSets()
      .then((sets) => {
        if (!active) return;
        setProblemSets(sets);
        // Default the selection to the first prepared problem (if any) so prepared mode is usable.
        setForm((f) => (f.prepared === null && sets[0] ? { ...f, prepared: sets[0] } : f));
      })
      .catch(() => active && setError('Failed to load prepared problems.'));
    return () => {
      active = false;
    };
  }, [runClient]);

  const selectPrepared = (id: string) =>
    setForm((f) => ({ ...f, prepared: problemSets.find((p) => p.id === id) ?? null }));

  const handleStart = () => {
    if (starting || startedRun) return; // disabled while-starting + after-success → no 2nd run
    const result = validateOperatorPrompt(form);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setStarting(true);
    const idempotencyKey = crypto.randomUUID();
    runClient
      .startDemoRun({ seed: result.seed }, { idempotencyKey })
      .then((run) => {
        setStartedRun(run);
        onStarted?.(run);
      })
      .catch(() => setError('Failed to start the run — retry.'))
      .finally(() => setStarting(false));
  };

  return (
    <section
      aria-label="Operator prompt"
      style={{
        fontFamily: 'var(--font-ui)',
        color: 'var(--fg-default)',
        padding: 'var(--space-5)',
      }}
    >
      <h2 style={{ fontSize: 'var(--text-h2)', margin: 0, marginBottom: 'var(--space-5)' }}>
        Start a demo run
      </h2>

      <fieldset style={{ ...field, border: 'none', padding: 0, margin: 0 }}>
        <legend style={labelText}>Problem source</legend>
        <label style={labelText}>
          <input
            type="radio"
            name="op-source"
            checked={form.source === 'prepared'}
            onChange={() => setForm((f) => ({ ...f, source: 'prepared' }))}
          />{' '}
          Prepared problem
        </label>
        <label style={labelText}>
          <input
            type="radio"
            name="op-source"
            checked={form.source === 'freeform'}
            onChange={() => setForm((f) => ({ ...f, source: 'freeform' }))}
          />{' '}
          Freeform prompt
        </label>
      </fieldset>

      {form.source === 'prepared' ? (
        <div style={field}>
          <label htmlFor="op-prepared" style={labelText}>
            Prepared problem
          </label>
          <select
            id="op-prepared"
            value={form.prepared?.id ?? ''}
            onChange={(e) => selectPrepared(e.target.value)}
            style={control}
          >
            <option value="" disabled>
              {problemSets.length === 0 ? 'No prepared problems' : 'Select a problem…'}
            </option>
            {problemSets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div style={field}>
          <label htmlFor="op-freeform" style={labelText}>
            Problem prompt
          </label>
          <textarea
            id="op-freeform"
            value={form.freeformText}
            onChange={(e) => setForm((f) => ({ ...f, freeformText: e.target.value }))}
            style={control}
            rows={3}
          />
        </div>
      )}

      {error && (
        <span role="alert" style={errorText}>
          {error}
        </span>
      )}

      <button
        type="button"
        onClick={handleStart}
        disabled={starting || startedRun !== null}
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 'var(--text-label)',
          fontWeight: 600,
          color: 'var(--fg-on-accent)',
          background: 'var(--accent)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-2) var(--space-5)',
          cursor: 'pointer',
          marginTop: 'var(--space-2)',
        }}
      >
        {starting ? 'Seeding population…' : 'Start demo run'}
      </button>

      {startedRun && (
        <p role="status" style={{ ...labelText, marginTop: 'var(--space-3)' }}>
          Run started: <span style={{ fontFamily: 'var(--font-mono)' }}>{startedRun.runId}</span>
        </p>
      )}
    </section>
  );
}
