import { describe, expect, it } from 'vitest';
import { RunConfig } from '@doppl/contracts';
import {
  CAP_CEILING,
  DEFAULT_FORM,
  buildRunConfig,
  clampCap,
  validateForm,
  type RunConfigFormValues,
} from '../../../../src/components/run/runConfigForm';

const validForm = (): RunConfigFormValues => ({
  ...DEFAULT_FORM,
  seed: 'Find a non-obvious technique transfer for last-mile vaccine delivery.',
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
