import { describe, expect, it } from 'vitest';
import { RunConfig } from '@doppl/contracts';
import type { RunCaps } from '@doppl/contracts';
import {
  CAP_CEILING,
  DEFAULT_FORM,
  buildRunConfig,
  capCeilingFromRunCaps,
  clampCap,
  clampCapsToCeiling,
  validateForm,
  type RunConfigFormValues,
} from '../../../../src/components/run/runConfigForm';

const validForm = (): RunConfigFormValues => ({
  ...DEFAULT_FORM,
  seed: 'Find a non-obvious technique transfer for last-mile vaccine delivery.',
});

// PD.18 — the form's cap ceiling is FETCHED from the API maxima (defaultConfig.caps), not a static
// mirror (a static mirror drifts above a low .env ceiling → the cap-default 422).
describe('runConfigForm — dynamic cap ceiling from fetched maxima (PD.18)', () => {
  const fetched: RunCaps = {
    maxPopulation: 12,
    maxGenerations: 6,
    energyBudget: 1000,
    maxSpawnDepth: 4,
    maxToolCalls: 80,
    wallClockTimeoutMs: 480_000,
  };

  it('cap_ceiling_from_run_caps_maps_minutes', () => {
    const ceiling = capCeilingFromRunCaps(fetched);
    expect(ceiling.maxPopulation).toBe(12);
    expect(ceiling.energyBudget).toBe(1000);
    expect(ceiling.maxToolCalls).toBe(80);
    expect(ceiling.wallClockMinutes).toBe(8); // 480000ms / 60000
  });

  it('clamp_caps_to_ceiling_lowers_over_ceiling_values', () => {
    const ceiling = capCeilingFromRunCaps(fetched);
    const clamped = clampCapsToCeiling(DEFAULT_FORM.caps, ceiling);
    expect(clamped.maxPopulation).toBe(12); // DEFAULT_FORM 18 → 12 (clamped)
    expect(clamped.energyBudget).toBe(1000); // 12000 → 1000 (clamped)
    expect(clamped.maxGenerations).toBe(5); // 5 ≤ 6 → unchanged
  });
});

describe('runConfigForm — form→RunConfig mapping + cap-max guard', () => {
  // spec(§12): a valid form maps to a RunConfig that passes the shared Zod; an invalid field is caught.
  it('test_form_validates_against_shared_zod', () => {
    const ok = validateForm(validForm());
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(RunConfig.safeParse(ok.config).success).toBe(true);

    const bad = validateForm({ ...validForm(), seed: '' }); // empty seed fails RunConfig
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.seed).toBeTruthy();
  });

  // spec(§14/§17): a cap above the ceiling is rejected client-side + NOT submitted; lowering submits.
  it('test_cap_over_ceiling_rejected_client_side', () => {
    const over = validateForm({
      ...validForm(),
      caps: { ...validForm().caps, maxPopulation: CAP_CEILING.maxPopulation + 5 },
    });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.errors.maxPopulation).toBeTruthy();

    const lowered = validateForm({
      ...validForm(),
      caps: { ...validForm().caps, maxPopulation: 3 }, // within maxima
    });
    expect(lowered.ok).toBe(true);

    // clampCap is lowering-only: it never returns above the ceiling.
    expect(clampCap('maxPopulation', CAP_CEILING.maxPopulation + 999)).toBe(
      CAP_CEILING.maxPopulation,
    );
    expect(clampCap('maxPopulation', 4)).toBe(4);
  });

  // spec(§12): disabling BOTH subtypes is blocked (both-equal must-ship).
  it('test_cannot_disable_all_subtypes', () => {
    const none = validateForm({
      ...validForm(),
      enabledSubtypes: { cross_domain_transfer: false, zeitgeist_synthesis: false },
    });
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.errors.enabledSubtypes).toBeTruthy();
  });

  // spec(§12): the wall-clock UX minutes convert to the contract's wallClockTimeoutMs.
  it('test_builds_runconfig_shape', () => {
    const config = buildRunConfig(validForm());
    expect(config.caps.wallClockTimeoutMs).toBe(validForm().caps.wallClockMinutes * 60_000);
    expect(config.enabledSubtypes).toContain('cross_domain_transfer');
    expect(RunConfig.safeParse(config).success).toBe(true);
  });
});

// FV.3 — the launcher wires the FB run-controls (FB.0–FB.4) into the RunConfig. The form carries the
// mutagen-operator multi-select + the diverge/converge dial; buildRunConfig threads them ADDITIVELY (omit
// when unused → byte-identical to a no-FB-controls run). The dial biases GENERATION only (rule #6 — the
// launcher never exposes a judge/scoring lever); the operators are recorded generation inputs.
describe('runConfigForm — FB run-controls (FV.3 launcher wiring)', () => {
  it('test_operators_threaded_when_selected_omitted_when_empty', () => {
    const withOps = buildRunConfig({
      ...validForm(),
      operators: ['breakthrough', 'polymath'],
    });
    expect(withOps.generationOperators).toEqual(['breakthrough', 'polymath']);
    expect(RunConfig.safeParse(withOps).success).toBe(true);
    // none selected → the field is OMITTED (the contract requires min 1 when present; byte-identical baseline).
    const noOps = buildRunConfig({ ...validForm(), operators: [] });
    expect(noOps.generationOperators).toBeUndefined();
  });

  it('test_generation_bias_threaded_when_engaged_omitted_when_neutral', () => {
    const diverge = buildRunConfig({ ...validForm(), generationBias: 0.6 });
    expect(diverge.generationBias).toBe(0.6);
    expect(RunConfig.safeParse(diverge).success).toBe(true);
    const converge = buildRunConfig({ ...validForm(), generationBias: -0.8 });
    expect(converge.generationBias).toBe(-0.8);
    // a neutral 0 dial → OMITTED (byte-identical to a no-dial run; the engaged value is what's recorded).
    const neutral = buildRunConfig({ ...validForm(), generationBias: 0 });
    expect(neutral.generationBias).toBeUndefined();
  });

  it('test_fb_controls_default_to_a_clean_baseline', () => {
    // the default FB controls (no operators + a neutral dial, from DEFAULT_FORM) → buildRunConfig omits both
    // (a default run is byte-identical to the pre-FB.0 RunConfig shape). validForm() carries the required seed.
    const config = buildRunConfig(validForm());
    expect(config.generationOperators).toBeUndefined();
    expect(config.generationBias).toBeUndefined();
    expect(RunConfig.safeParse(config).success).toBe(true);
  });
});
