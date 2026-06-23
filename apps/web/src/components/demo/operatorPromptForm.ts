import type { ProblemSet } from '../../data/operatorPromptClient';

/**
 * operatorPromptForm (PD.5b, ARCHITECTURE.md §17) — the pure form→seed mapping for the operator-prompt
 * panel. The operator picks a prepared problem OR types a freeform prompt; both resolve to the run's
 * `seed` (the existing POST /runs deep-merges the partial `{seed}` against defaults — PD.5a/PD.10
 * verified; PD.10 isolates the seed as wrapUntrusted DATA). Validation is fail-closed: a non-empty seed
 * must be formable (RunConfig.seed is min(1)).
 */

export type OperatorPromptSource = 'prepared' | 'freeform';

export interface OperatorPromptFormValues {
  source: OperatorPromptSource;
  /** The selected prepared problem (null until the operator picks one). */
  prepared: ProblemSet | null;
  /** The operator's typed freeform problem statement. */
  freeformText: string;
}

export const DEFAULT_OPERATOR_PROMPT_FORM: OperatorPromptFormValues = {
  source: 'prepared',
  prepared: null,
  freeformText: '',
};

/** The chosen seed (trimmed): the prepared problem's `prompt`, or the freeform text. */
export function buildDemoSeed(form: OperatorPromptFormValues): string {
  const raw = form.source === 'prepared' ? (form.prepared?.prompt ?? '') : form.freeformText;
  return raw.trim();
}

export type OperatorPromptValidation = { ok: true; seed: string } | { ok: false; error: string };

/** Fail-closed validation: no source-selection / empty (or whitespace-only) seed → an error. */
export function validateOperatorPrompt(form: OperatorPromptFormValues): OperatorPromptValidation {
  if (form.source === 'prepared' && form.prepared === null) {
    return { ok: false, error: 'Select a prepared problem.' };
  }
  const seed = buildDemoSeed(form);
  if (seed.length === 0) {
    return {
      ok: false,
      error:
        form.source === 'prepared'
          ? 'The selected problem has no prompt.'
          : 'Enter a problem prompt.',
    };
  }
  return { ok: true, seed };
}
