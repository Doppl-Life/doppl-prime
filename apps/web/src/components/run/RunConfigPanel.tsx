import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { Run } from '../../data/contracts';
import type { RunClient } from '../../data/runClient';
import {
  CAP_CEILING,
  DEFAULT_FORM,
  clampCap,
  validateForm,
  type CapKey,
  type FieldErrors,
  type RunConfigFormValues,
} from './runConfigForm';

/**
 * RunConfigPanel — the operator run-config panel (FROM the prototype ui_kits/run-launcher). Edits the
 * RunConfig/RunCaps fields, validates against the FROZEN shared Zod before submit, and Start issues the
 * idempotent POST /runs via the injected runClient (with a per-submit idempotency key the API dedups —
 * §11; never re-implemented). Cap-max is fail-closed at the browser seam (lowering-only; API + kernel
 * authoritative). Invalid settings surface inline, programmatically-associated field errors and block
 * submission (validate-on-submit — accessible, says WHY). The persistent mount is the P7.14 shell.
 */
export interface RunConfigPanelProps {
  runClient: Pick<RunClient, 'startRun'>;
  onStarted?: (run: Run) => void;
  initialValues?: RunConfigFormValues;
}

const CAP_FIELDS: { key: CapKey; label: string }[] = [
  { key: 'maxPopulation', label: 'Population' },
  { key: 'maxGenerations', label: 'Generations' },
  { key: 'energyBudget', label: 'Energy budget (doppl_energy)' },
  { key: 'maxSpawnDepth', label: 'Spawn depth' },
  { key: 'maxToolCalls', label: 'Tool calls' },
  { key: 'wallClockMinutes', label: 'Wall-clock (min)' },
];

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

export function RunConfigPanel({ runClient, onStarted, initialValues }: RunConfigPanelProps) {
  const [form, setForm] = useState<RunConfigFormValues>(initialValues ?? DEFAULT_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [starting, setStarting] = useState(false);
  const [startedRun, setStartedRun] = useState<Run | null>(null);

  const setCap = (key: CapKey, value: number) =>
    setForm((f) => ({ ...f, caps: { ...f.caps, [key]: clampCap(key, value) } }));
  const toggleSubtype = (key: keyof RunConfigFormValues['enabledSubtypes']) =>
    setForm((f) => ({
      ...f,
      enabledSubtypes: { ...f.enabledSubtypes, [key]: !f.enabledSubtypes[key] },
    }));

  const handleStart = () => {
    if (starting || startedRun) return; // disabled while-starting + after-success → no 2nd run
    const result = validateForm(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setStarting(true);
    const idempotencyKey = crypto.randomUUID();
    runClient
      .startRun(result.config, { idempotencyKey })
      .then((run) => {
        setStartedRun(run);
        onStarted?.(run);
      })
      .catch(() => setErrors({ form: 'Failed to start the run — retry.' }))
      .finally(() => setStarting(false));
  };

  const errId = (name: string) => `rc-${name}-err`;
  const describe = (name: string) => (errors[name] ? errId(name) : undefined);
  const invalid = (name: string) => (errors[name] ? true : undefined);

  return (
    <section
      aria-label="Run configuration"
      style={{
        fontFamily: 'var(--font-ui)',
        color: 'var(--fg-default)',
        padding: 'var(--space-5)',
      }}
    >
      <h2 style={{ fontSize: 'var(--text-h2)', margin: 0, marginBottom: 'var(--space-5)' }}>
        Seed a new run
      </h2>

      <div style={field}>
        <label htmlFor="rc-seed" style={labelText}>
          Seed prompt
        </label>
        <textarea
          id="rc-seed"
          value={form.seed}
          onChange={(e) => setForm((f) => ({ ...f, seed: e.target.value }))}
          aria-invalid={invalid('seed')}
          aria-describedby={describe('seed')}
          style={control}
          rows={3}
        />
        {errors.seed && (
          <span id={errId('seed')} role="alert" style={errorText}>
            {errors.seed}
          </span>
        )}
      </div>

      <fieldset style={{ ...field, border: 'none', padding: 0, margin: 0 }}>
        <legend style={labelText}>Idea subtypes — ≥1 required</legend>
        <label style={labelText}>
          <input
            type="checkbox"
            checked={form.enabledSubtypes.cross_domain_transfer}
            onChange={() => toggleSubtype('cross_domain_transfer')}
            aria-invalid={invalid('enabledSubtypes')}
            aria-describedby={describe('enabledSubtypes')}
          />{' '}
          cross_domain_transfer
        </label>
        <label style={labelText}>
          <input
            type="checkbox"
            checked={form.enabledSubtypes.zeitgeist_synthesis}
            onChange={() => toggleSubtype('zeitgeist_synthesis')}
          />{' '}
          zeitgeist_synthesis
        </label>
        {errors.enabledSubtypes && (
          <span id={errId('enabledSubtypes')} role="alert" style={errorText}>
            {errors.enabledSubtypes}
          </span>
        )}
      </fieldset>

      {CAP_FIELDS.map(({ key, label }) => (
        <div key={key} style={field}>
          <label htmlFor={`rc-${key}`} style={labelText}>
            {label} (max {CAP_CEILING[key]})
          </label>
          <input
            id={`rc-${key}`}
            type="number"
            min={1}
            max={CAP_CEILING[key]}
            value={form.caps[key]}
            onChange={(e) => setCap(key, Number(e.target.value))}
            aria-invalid={invalid(key)}
            aria-describedby={describe(key)}
            style={control}
          />
          {errors[key] && (
            <span id={errId(key)} role="alert" style={errorText}>
              {errors[key]}
            </span>
          )}
        </div>
      ))}

      <div style={field}>
        <label htmlFor="rc-model" style={labelText}>
          Model profile
        </label>
        <input
          id="rc-model"
          value={form.modelProfile}
          onChange={(e) => setForm((f) => ({ ...f, modelProfile: e.target.value }))}
          style={control}
        />
      </div>

      <div style={field}>
        <label htmlFor="rc-scoring" style={labelText}>
          Scoring policy version
        </label>
        <input
          id="rc-scoring"
          value={form.scoringPolicyVersion}
          onChange={(e) => setForm((f) => ({ ...f, scoringPolicyVersion: e.target.value }))}
          style={control}
        />
      </div>

      <div style={field}>
        <label htmlFor="rc-rng" style={labelText}>
          RNG seed
        </label>
        <input
          id="rc-rng"
          type="number"
          value={form.rngSeed}
          onChange={(e) => setForm((f) => ({ ...f, rngSeed: Number(e.target.value) }))}
          style={control}
        />
      </div>

      {errors.form && (
        <span role="alert" style={errorText}>
          {errors.form}
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
        }}
      >
        {starting ? 'Seeding population…' : 'Start run'}
      </button>

      {startedRun && (
        <p role="status" style={{ ...labelText, marginTop: 'var(--space-3)' }}>
          Run started: <span style={{ fontFamily: 'var(--font-mono)' }}>{startedRun.id}</span>
        </p>
      )}
    </section>
  );
}
