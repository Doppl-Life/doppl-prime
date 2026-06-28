import { useEffect, useId, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
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
 *
 * P7.x UX revamp: the flat stack of bare inputs is reorganised into titled SECTION CARDS with plain-
 * language guidance — every idea subtype + mutagen operator carries an inline explanation, and the
 * resource caps / dial / RNG carry hover+focus InfoTips. Accessible names + field ids are UNCHANGED so
 * the validation contract + tests hold. Colours/spacing via var() tokens only (no raw hex/px — the
 * occasional `rem` is layout-only sizing where no spacing token fits).
 */
export interface RunConfigPanelProps {
  runClient: Pick<RunClient, 'startRun' | 'getCapMaxima' | 'getModelRouteOverrides'>;
  onStarted?: (run: StartRunResult) => void;
  initialValues?: RunConfigFormValues;
  /** Islands pivot A4 — the case study this run executes (from the chosen prepared problem); tags the run so
   *  it joins that case study's bloom. Undefined for a freeform seed (an untagged run). */
  caseStudyId?: string | undefined;
}

const CAP_FIELDS: { key: CapKey; label: string; help: string }[] = [
  {
    key: 'maxPopulation',
    label: 'Population',
    help: 'How many candidate ideas live in each generation. Larger means a broader search — and more model cost per round.',
  },
  {
    key: 'maxGenerations',
    label: 'Generations',
    help: 'How many rounds of breed → score → select to run. More generations means deeper refinement of the survivors.',
  },
  {
    key: 'energyBudget',
    label: 'Energy budget (doppl_energy)',
    help: 'Total productive spend the run may consume. Failed or retried attempts do not debit it; the run halts when it is exhausted.',
  },
  {
    key: 'maxSpawnDepth',
    label: 'Spawn depth',
    help: 'How many generations a single lineage may descend before it must stop reproducing — bounds runaway breeding.',
  },
  {
    key: 'maxToolCalls',
    label: 'Tool calls',
    help: 'Ceiling on agent tool / web-research calls across the whole run. Caps external-call cost and latency.',
  },
  {
    key: 'wallClockMinutes',
    label: 'Wall-clock (min)',
    help: 'Hard time limit. The run stops when it is reached, whatever stage it is in.',
  },
];

/**
 * The idea subtypes the run may generate (≥1 required). The blurbs mirror the two CandidateIdea subtypes
 * (ARCHITECTURE.md §3): cross_domain_transfer maps a technique from a source domain onto the target
 * problem; zeitgeist_synthesis fits a thesis to current signals.
 */
const SUBTYPE_INFO: Record<
  keyof RunConfigFormValues['enabledSubtypes'],
  { title: string; blurb: string }
> = {
  cross_domain_transfer: {
    title: 'Cross-domain transfer',
    blurb:
      'Borrow a proven technique from one field and map it onto your problem in another. Produces an explicit source → target mapping and the mechanism it expects to carry over.',
  },
  zeitgeist_synthesis: {
    title: 'Zeitgeist synthesis',
    blurb:
      'Build a sharp thesis fitted to the current moment — why this, why now — backed by falsifiable predictions and comparable prior art.',
  },
};

/**
 * Plain-language gloss for each mutagen operator (the optional ideation lenses). Mirrors the system-
 * authored steering fragments in apps/api generationOperators.ts (rule #9 — we don't import across the
 * apps boundary, so these are kept in sync by hand). Each operator nudges HOW an agenome ideates; none
 * touches caps, scoring, or the held-out judge (rules #1/#6).
 */
const OPERATOR_INFO: Record<GenerationOperator, string> = {
  breakthrough: 'Reject incremental tweaks and pursue a step-change in how the problem is solved.',
  first_principles:
    'Decompose the problem to its fundamentals and rebuild a solution, ignoring inherited convention.',
  polymath: 'Draw analogies across unrelated disciplines and transplant a mechanism from a distant field.',
  breakout: 'Question the implicit assumptions and explore a solution space others overlook.',
  blindside: 'Surface the non-obvious angle or overlooked factor that conventional approaches miss.',
  subtraction: 'Remove a component, step, or assumption and find the simpler solution that remains.',
  constraint: 'Impose a deliberate limitation and let it force a more inventive approach.',
};

const RNG_HELP =
  'Seeds the run’s deterministic randomness. The same seed + config reproduces the same evolution on replay; change it to explore a different roll of the dice.';
const DIAL_HELP =
  'Biases generation between converge (refine near prior ideas, narrower) and diverge (strike out into new territory, wider). It also steers in-run web retrieval. The held-out judge and scoring are untouched.';
const SCORING_HELP =
  'The fitness floor the organism cannot move: scoring policy + held-out judge rubric are fixed at boot, not run-settable (rule #6 — anti-reward-hacking).';

// ── shared token-only styles ───────────────────────────────────────────────
const sectionCard: CSSProperties = {
  background: 'var(--bg-surface)',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-5)',
  marginBottom: 'var(--space-5)',
  display: 'grid',
  gap: 'var(--space-3)',
};
const sectionTitleRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
};
const sectionTitle: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-h3)',
  fontWeight: 600,
  color: 'var(--fg-default)',
  margin: 0,
};
// the honey-amber marker that leads each section title — the warm counterweight to the teal chrome.
const titleAccent: CSSProperties = {
  flex: 'none',
  width: 'var(--space-1)',
  alignSelf: 'stretch',
  minHeight: 'var(--text-h3)',
  background: 'var(--accent-2)',
  borderRadius: 'var(--radius-full)',
};
const sectionHint: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
  margin: 0,
};
const field: CSSProperties = { display: 'grid', gap: 'var(--space-1)' };
// Advanced fields breathe a little more between label and control.
const fieldRoomy: CSSProperties = { display: 'grid', gap: 'var(--space-2)' };
const labelText: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-label)',
  fontWeight: 500,
  color: 'var(--fg-muted)',
};
const control: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-mono)',
  color: 'var(--fg-default)',
  background: 'var(--bg-surface-2)',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2)',
  width: '100%',
  boxSizing: 'border-box',
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
const tileGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 15rem), 1fr))',
  gap: 'var(--space-3)',
};

/** A selectable tile (subtype / operator). Selected → accent border + soft accent wash (never colour-only;
 *  the checkbox glyph + label remain). */
function tileStyle(selected: boolean): CSSProperties {
  return {
    display: 'grid',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    // selected uses the secondary "honey amber" so a chosen option reads distinctly from the teal
    // primary CTA / active state — the warm/cool contrast carries the selection signal.
    border: `thin solid ${selected ? 'var(--accent-2)' : 'var(--border-subtle)'}`,
    borderRadius: 'var(--radius-md)',
    background: selected
      ? 'color-mix(in srgb, var(--accent-2) 14%, var(--bg-surface-2))'
      : 'var(--bg-surface-2)',
    cursor: 'pointer',
    transition: 'border-color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out)',
  };
}

/**
 * InfoTip — an accessible "ⓘ" affordance that reveals a short explanation on hover OR keyboard focus
 * (no library; pure inline tokens). The bubble is `role="tooltip"` and wired to the trigger via
 * aria-describedby so screen readers announce it too.
 */
function InfoTip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span style={{ position: 'relative', display: 'inline-flex', lineHeight: 1 }}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 'var(--space-4)',
          height: 'var(--space-4)',
          padding: 0,
          fontFamily: 'var(--font-ui)',
          fontSize: 'var(--text-caption)',
          fontWeight: 700,
          color: 'var(--fg-muted)',
          background: 'transparent',
          border: 'thin solid var(--border-strong)',
          borderRadius: 'var(--radius-full)',
          cursor: 'help',
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + var(--space-1))',
            left: 0,
            zIndex: 'var(--z-popover)' as unknown as number,
            width: '18rem',
            maxWidth: '80vw',
            padding: 'var(--space-2) var(--space-3)',
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-caption)',
            fontWeight: 400,
            lineHeight: 'var(--text-body-lh)',
            color: 'var(--fg-default)',
            background: 'var(--bg-overlay)',
            border: 'thin solid var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--elev-2)',
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

/** A section card: title row (+ optional InfoTip), optional hint line, then children. */
function Section({
  title,
  hint,
  info,
  children,
}: {
  title: string;
  hint?: string;
  info?: { label: string; text: string };
  children: ReactNode;
}) {
  return (
    <section style={sectionCard}>
      <div style={sectionTitleRow}>
        <span aria-hidden="true" style={titleAccent} />
        <h3 style={sectionTitle}>{title}</h3>
        {info && <InfoTip label={info.label} text={info.text} />}
      </div>
      {hint && <p style={sectionHint}>{hint}</p>}
      {children}
    </section>
  );
}

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

  const subtypeCount = Object.values(form.enabledSubtypes).filter(Boolean).length;
  const seedChars = form.seed.trim().length;

  return (
    <section
      aria-label="Run configuration"
      style={{ fontFamily: 'var(--font-ui)', color: 'var(--fg-default)' }}
    >
      <h2 style={{ fontSize: 'var(--text-h2)', margin: 0, marginBottom: 'var(--space-4)' }}>
        Seed a new run
      </h2>

      {/* ── Seed prompt ─────────────────────────────────────────────────── */}
      <Section
        title="Seed prompt"
        hint="Describe the problem (or the situation) you want the swarm to evolve ideas against. A few sentences of context works best."
      >
        <div style={field}>
          <textarea
            id="rc-seed"
            aria-label="Seed prompt"
            value={form.seed}
            onChange={(e) => setForm((f) => ({ ...f, seed: e.target.value }))}
            aria-invalid={invalid('seed')}
            aria-describedby={describe('seed')}
            placeholder="e.g. Paparazzi drones keep breaching the privacy of a superyacht at sea — find a non-obvious way to restore it."
            style={{ ...control, minHeight: '11rem', resize: 'vertical', lineHeight: 'var(--text-body-lh)' }}
            rows={8}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
            {errors.seed ? (
              <span id={errId('seed')} role="alert" style={errorText}>
                {errors.seed}
              </span>
            ) : (
              <span />
            )}
            <span style={fixedLine}>{seedChars} characters</span>
          </div>
        </div>
      </Section>

      {/* ── Idea subtypes ───────────────────────────────────────────────── */}
      <Section
        title="Idea subtypes"
        hint={`Pick the kind(s) of idea the swarm may generate — at least one. ${subtypeCount} selected.`}
      >
        <fieldset
          style={{ border: 'none', padding: 0, margin: 0, ...tileGrid }}
          aria-describedby={describe('enabledSubtypes')}
        >
          <legend
            style={{
              ...sectionHint,
              padding: 0,
              // visually hidden — the Section title already names the group; keeps the fieldset labelled.
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)',
            }}
          >
            Idea subtypes — at least one required
          </legend>
          {(Object.keys(SUBTYPE_INFO) as (keyof typeof SUBTYPE_INFO)[]).map((key) => {
            const selected = form.enabledSubtypes[key];
            const isFirst = key === 'cross_domain_transfer';
            return (
              <label key={key} style={tileStyle(selected)}>
                <span
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSubtype(key)}
                    {...(isFirst ? { 'aria-invalid': invalid('enabledSubtypes') } : {})}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-ui)',
                      fontSize: 'var(--text-label)',
                      fontWeight: 600,
                      color: 'var(--fg-default)',
                    }}
                  >
                    {SUBTYPE_INFO[key].title}
                  </span>
                </span>
                <code
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-mono-sm)',
                    color: 'var(--fg-faint)',
                  }}
                >
                  {key}
                </code>
                <span style={{ ...sectionHint, color: 'var(--fg-muted)' }}>
                  {SUBTYPE_INFO[key].blurb}
                </span>
              </label>
            );
          })}
        </fieldset>
        {errors.enabledSubtypes && (
          <span id={errId('enabledSubtypes')} role="alert" style={errorText}>
            {errors.enabledSubtypes}
          </span>
        )}
      </Section>

      {/* ── Mutagen operators ───────────────────────────────────────────── */}
      {/* FV.3 — mutagen-operator picker (FB.3). The closed 7-enum; selected operators steer GENERATION as
          trusted framing (the api isolates them, rule #5). Optional — none selected → no operator framing. */}
      <Section
        title="Ideation lenses"
        hint="Optional. Each lens nudges HOW agents think while generating ideas — combine a few, or leave them off for an unsteered run."
      >
        <fieldset style={{ border: 'none', padding: 0, margin: 0, ...tileGrid }}>
          <legend
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)',
            }}
          >
            Mutagen operators — optional ideation lenses
          </legend>
          {GenerationOperator.options.map((op) => {
            const selected = form.operators.includes(op);
            return (
              <label key={op} style={tileStyle(selected)}>
                <span
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}
                >
                  {/* aria-label pins the accessible NAME to exactly the operator key — the visible blurb
                      can then live inside the tile without disturbing the label/test contract. */}
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleOperator(op)}
                    aria-label={op}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-mono)',
                      fontWeight: 600,
                      color: 'var(--fg-default)',
                    }}
                  >
                    {op}
                  </span>
                </span>
                <span style={sectionHint}>{OPERATOR_INFO[op]}</span>
              </label>
            );
          })}
        </fieldset>
      </Section>

      {/* ── Exploration dial ────────────────────────────────────────────── */}
      {/* FV.3 — the diverge/converge dial (FB.4). ∈ [−1,1], 0 neutral. Biases GENERATION only (breadth↔depth);
          the held-out judge + scoring are untouched (rule #6). The numeric value is shown (DS rule 1/4 — never
          color/position alone). */}
      <Section
        title="Exploration dial"
        info={{ label: 'About exploration bias', text: DIAL_HELP }}
      >
        <div style={field}>
          <label htmlFor="rc-bias" style={labelText}>
            Diverge / converge —{' '}
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-default)' }}>
              {biasLabel}
            </span>
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
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-mono-sm)',
              color: 'var(--fg-muted)',
            }}
          >
            <span>← converge −1</span>
            <span>neutral 0</span>
            <span>diverge +1 →</span>
          </div>
          <span style={fixedLine}>
            Also steers in-run retrieval — converge follows prior agents&rsquo; research (near),
            diverge strikes out from it (far).
          </span>
        </div>
      </Section>

      {/* ── Resource caps ───────────────────────────────────────────────── */}
      <Section
        title="Resource limits"
        hint="Hard ceilings the kernel enforces. The run halts the moment any one is hit — lower them for a quick, cheap run; raise them for depth."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 13rem), 1fr))',
            gap: 'var(--space-4)',
            // top-align cells so a longer help text in one column can't stretch its row-mate's input.
            alignItems: 'start',
          }}
        >
          {CAP_FIELDS.map(({ key, label, help }) => (
            <div key={key} style={field}>
              {/* reserve two label lines + bottom-align so every input lands on the same row even when
                  a label (e.g. the energy budget) wraps to two lines. */}
              <label
                htmlFor={`rc-${key}`}
                style={{
                  ...labelText,
                  display: 'flex',
                  alignItems: 'flex-end',
                  lineHeight: 'var(--text-label-lh)',
                  minHeight: 'calc(var(--text-label-lh) * 2)',
                }}
              >
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
                aria-describedby={`rc-${key}-help${errors[key] ? ` ${errId(key)}` : ''}`}
                style={control}
              />
              <span id={`rc-${key}-help`} style={sectionHint}>
                {help}
              </span>
              {errors[key] && (
                <span id={errId(key)} role="alert" style={errorText}>
                  {errors[key]}
                </span>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ── Advanced ────────────────────────────────────────────────────── */}
      <details style={{ ...sectionCard, display: 'block' }}>
        <summary
          style={{
            ...sectionTitle,
            cursor: 'pointer',
            listStyle: 'revert',
            marginBottom: 'var(--space-4)',
          }}
        >
          Advanced
        </summary>
        {/* an explicit grid wrapper: a <details> doesn't lay its children out as grid items, so the
            inter-field `gap` must live on a real container, not on the <details> itself. */}
        <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
          <p style={sectionHint}>
            Model routing, reproducibility, and the fixed fitness anchor. Most runs leave these as-is.
          </p>

          {/* FB.2 — the model-override picker: per overridable GENERATION role, pick an allowlisted
            {provider, modelId} or "Boot default" (no override). final_judge is NEVER offered (rule #6 — the
            held-out judge model is not run-swappable). Only renders for the fetched allowlist roles. */}
        {Object.entries(modelAllowlist).map(([role, entries]) => {
          const current = form.modelRouteOverride[role];
          const value = current ? `${current.provider}::${current.modelId}` : '';
          return (
            <div key={role} style={fieldRoomy}>
              <label htmlFor={`rc-model-${role}`} style={labelText}>
                {role} model
              </label>
              <select
                id={`rc-model-${role}`}
                value={value}
                onChange={(e) => setModelOverride(role, e.target.value)}
                style={{ ...control, maxWidth: '32rem' }}
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

        <div style={fieldRoomy}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <label htmlFor="rc-rng" style={labelText}>
              RNG seed
            </label>
            <InfoTip label="About the RNG seed" text={RNG_HELP} />
          </span>
          <input
            id="rc-rng"
            type="number"
            value={form.rngSeed}
            onChange={(e) => setForm((f) => ({ ...f, rngSeed: Number(e.target.value) }))}
            style={{ ...control, maxWidth: '14rem' }}
          />
        </div>

        {/* The scoring policy + held-out judge are rule-#6 BOOT IMMUTABLES — not run-settable (the fitness
            floor the organism can't move, anti-reward-hacking). Shown READ-ONLY so the operator sees the
            anchor instead of an editable knob that did nothing. */}
        <div style={fieldRoomy}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <span style={labelText}>Scoring + held-out judge — fixed</span>
            <InfoTip label="Why scoring is fixed" text={SCORING_HELP} />
          </span>
          <span style={fixedLine}>
            scoring {RECORDED_SCORING_POLICY_VERSION} · judge {HELD_OUT_JUDGE_VERSION} — immutable to
            runs (rule #6)
          </span>
        </div>
        </div>
      </details>

      {/* ── Submit ──────────────────────────────────────────────────────── */}
      {errors.form && (
        <p role="alert" style={{ ...errorText, marginBottom: 'var(--space-2)' }}>
          {errors.form}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={handleStart}
          disabled={starting || startedRun !== null}
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-body)',
            fontWeight: 600,
            color: 'var(--fg-on-accent)',
            background: starting || startedRun ? 'var(--accent-press)' : 'var(--accent)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3) var(--space-6)',
            cursor: starting || startedRun ? 'default' : 'pointer',
            opacity: starting || startedRun ? 0.8 : 1,
          }}
        >
          {starting ? 'Seeding population…' : startedRun ? 'Run started' : 'Start run'}
        </button>
        {startedRun && (
          <span role="status" style={labelText}>
            Run started:{' '}
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-default)' }}>
              {startedRun.runId}
            </span>
          </span>
        )}
      </div>
    </section>
  );
}
