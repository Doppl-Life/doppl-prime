import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { GenerationOperator } from '../../data/contracts';
import type { ModelRouteOverrideAllowlist, RunClient, StartRunResult } from '../../data/runClient';
import {
  CAP_CEILING,
  DEFAULT_FORM,
  HELD_OUT_JUDGE_VERSION,
  RECORDED_SCORING_POLICY_VERSION,
  capCeilingFromRunCaps,
  clampCapsToCeiling,
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
  runClient: Pick<RunClient, 'startRun' | 'getCapMaxima' | 'getModelRouteOverrides'>;
  onStarted?: (run: StartRunResult) => void;
  initialValues?: RunConfigFormValues;
  /** Islands pivot A4 — the case study this run executes (from the chosen prepared problem); tags the run so
   *  it joins that case study's bloom. Undefined for a freeform seed (an untagged run). */
  caseStudyId?: string | undefined;
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
const fixedLine: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
};

export function RunConfigPanel({
  runClient,
  onStarted,
  initialValues,
  caseStudyId,
}: RunConfigPanelProps) {
  const [form, setForm] = useState<RunConfigFormValues>(initialValues ?? DEFAULT_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [starting, setStarting] = useState(false);
  const [startedRun, setStartedRun] = useState<StartRunResult | null>(null);
  // PD.18 — the cap ceiling is FETCHED from the API maxima (defaultConfig.caps) so the form can't offer
  // a value the route rejects (the cap-default 422). Default to the static CAP_CEILING; a successful
  // fetch lowers it to the REAL maxima + clamps the current form caps. A fetch failure keeps the static
  // fallback (never blocks the form). The kernel/route stays the sole cap authority (rule #1).
  const [ceiling, setCeiling] = useState<RunConfigFormValues['caps']>(CAP_CEILING);
  // FB.2 — the per-role model-override allowlist (GET /config/model-route-overrides). Empty until fetched /
  // on fetch failure → no picker shown (the run simply uses the boot models). final_judge is never present
  // (rule #6). The picker offers only these targets; the API + kernel overlay re-validate (rule #1).
  const [modelAllowlist, setModelAllowlist] = useState<ModelRouteOverrideAllowlist>({});

  useEffect(() => {
    let active = true;
    runClient
      .getCapMaxima()
      .then((caps) => {
        if (!active) return;
        const fetched = capCeilingFromRunCaps(caps);
        setCeiling(fetched);
        setForm((f) => ({ ...f, caps: clampCapsToCeiling(f.caps, fetched) }));
      })
      .catch(() => undefined); // keep the static CAP_CEILING fallback
    return () => {
      active = false;
    };
  }, [runClient]);

  useEffect(() => {
    let active = true;
    runClient
      .getModelRouteOverrides()
      .then((allowlist) => {
        if (active) setModelAllowlist(allowlist);
      })
      .catch(() => undefined); // no picker if the allowlist isn't available
    return () => {
      active = false;
    };
  }, [runClient]);

  const setCap = (key: CapKey, value: number) =>
    setForm((f) => ({
      ...f,
      caps: { ...f.caps, [key]: Math.max(1, Math.min(value, ceiling[key])) },
    }));
  const toggleSubtype = (key: keyof RunConfigFormValues['enabledSubtypes']) =>
    setForm((f) => ({
      ...f,
      enabledSubtypes: { ...f.enabledSubtypes, [key]: !f.enabledSubtypes[key] },
    }));
  // FV.3 — the FB run-controls. operators: toggle membership in the closed 7-enum (FB.3); generationBias:
  // the diverge/converge dial ∈ [−1,1] (FB.4). Both bias GENERATION only — no judge/scoring lever here.
  const toggleOperator = (op: GenerationOperator) =>
    setForm((f) => ({
      ...f,
      operators: f.operators.includes(op)
        ? f.operators.filter((o) => o !== op)
        : [...f.operators, op],
    }));
  const setBias = (value: number) =>
    setForm((f) => ({ ...f, generationBias: Math.max(-1, Math.min(1, value)) }));
  // FB.2 — set/clear a role's model override. '' (boot default) DELETES the role from the override map so a
  // default selection omits it entirely (byte-identical baseline). The value encodes `provider::modelId`
  // (split on the FIRST `::` — a modelId may itself contain a slash but never `::`).
  const setModelOverride = (role: string, value: string) =>
    setForm((f) => {
      const next = { ...f.modelRouteOverride };
      if (value === '') {
        delete next[role];
      } else {
        const sep = value.indexOf('::');
        next[role] = { provider: value.slice(0, sep), modelId: value.slice(sep + 2) };
      }
      return { ...f, modelRouteOverride: next };
    });
  const biasLabel =
    form.generationBias > 0
      ? `diverge +${form.generationBias.toFixed(1)}`
      : form.generationBias < 0
        ? `converge ${form.generationBias.toFixed(1)}`
        : 'neutral 0.0';

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
      .startRun(result.config, {
        idempotencyKey,
        ...(caseStudyId !== undefined ? { caseStudyId } : {}),
      })
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

      {/* FV.3 — mutagen-operator picker (FB.3). The closed 7-enum; selected operators steer GENERATION as
          trusted framing (the api isolates them, rule #5). Optional — none selected → no operator framing. */}
      <fieldset style={{ ...field, border: 'none', padding: 0, margin: 0 }}>
        <legend style={labelText}>Mutagen operators — optional ideation lenses</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {GenerationOperator.options.map((op) => (
            <label key={op} style={{ ...labelText, display: 'inline-flex', gap: 'var(--space-1)' }}>
              <input
                type="checkbox"
                checked={form.operators.includes(op)}
                onChange={() => toggleOperator(op)}
              />{' '}
              {op}
            </label>
          ))}
        </div>
      </fieldset>

      {/* FV.3 — the diverge/converge dial (FB.4). ∈ [−1,1], 0 neutral. Biases GENERATION only (breadth↔depth);
          the held-out judge + scoring are untouched (rule #6). The numeric value is shown (DS rule 1/4 — never
          color/position alone). */}
      <div style={field}>
        <label htmlFor="rc-bias" style={labelText}>
          Diverge / converge dial —{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>{biasLabel}</span>
        </label>
        <input
          id="rc-bias"
          type="range"
          min={-1}
          max={1}
          step={0.1}
          value={form.generationBias}
          onChange={(e) => setBias(Number(e.target.value))}
          aria-label="Generation diverge converge dial"
          aria-valuetext={biasLabel}
        />
        <span style={fixedLine}>
          Also steers in-run retrieval — converge follows prior agents&rsquo; research (near),
          diverge strikes out from it (far).
        </span>
      </div>

      {CAP_FIELDS.map(({ key, label }) => (
        <div key={key} style={field}>
          <label htmlFor={`rc-${key}`} style={labelText}>
            {label} (max {ceiling[key]})
          </label>
          <input
            id={`rc-${key}`}
            type="number"
            min={1}
            max={ceiling[key]}
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

      {/* FB.2 — the model-override picker: per overridable GENERATION role, pick an allowlisted
          {provider, modelId} or "Boot default" (no override). final_judge is NEVER offered (rule #6 — the
          held-out judge model is not run-swappable). Only renders for the fetched allowlist roles. */}
      {Object.entries(modelAllowlist).map(([role, entries]) => {
        const current = form.modelRouteOverride[role];
        const value = current ? `${current.provider}::${current.modelId}` : '';
        return (
          <div key={role} style={field}>
            <label htmlFor={`rc-model-${role}`} style={labelText}>
              {role} model
            </label>
            <select
              id={`rc-model-${role}`}
              value={value}
              onChange={(e) => setModelOverride(role, e.target.value)}
              style={control}
            >
              <option value="">Boot default</option>
              {entries.map((entry) => (
                <option
                  key={`${entry.provider}::${entry.modelId}`}
                  value={`${entry.provider}::${entry.modelId}`}
                >
                  {entry.provider} · {entry.modelId}
                </option>
              ))}
            </select>
          </div>
        );
      })}

      {/* The scoring policy + held-out judge are rule-#6 BOOT IMMUTABLES — not run-settable (the fitness
          floor the organism can't move, anti-reward-hacking). Shown READ-ONLY so the operator sees the
          anchor instead of an editable knob that did nothing. */}
      <div style={field}>
        <span style={labelText}>Scoring + held-out judge — fixed (anti-reward-hacking)</span>
        <span style={fixedLine}>
          scoring {RECORDED_SCORING_POLICY_VERSION} · judge {HELD_OUT_JUDGE_VERSION} — immutable to
          runs (rule #6)
        </span>
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
          Run started: <span style={{ fontFamily: 'var(--font-mono)' }}>{startedRun.runId}</span>
        </p>
      )}
    </section>
  );
}
