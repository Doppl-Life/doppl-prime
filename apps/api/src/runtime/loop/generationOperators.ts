import { GenerationOperator } from '@doppl/contracts';

/**
 * FB.3 — mutagen-operator ideation-lens fragments (ARCHITECTURE.md §5/§6, KEY SAFETY RULES #5/#6/#1/#8).
 *
 * Each member of the closed 7-enum {@link GenerationOperator} (FB.0) maps to a SYSTEM-AUTHORED, vetted,
 * TRUSTED steering line. {@link composeOperatorFraming} folds the run-selected operators into a framing
 * suffix that {@link import('./generationLoop').buildPopulationRequest} appends to the generation SYSTEM
 * message (alongside the agenome systemPrompt + the fixed GENERATION_ISOLATION_FRAMING) — so the operators
 * STEER how an agenome ideates. The per-run PROBLEM stays isolated as untrusted DATA in the `wrapUntrusted`
 * user message (rule #5, PD.10 unchanged): operators are TRUSTED framing, NOT untrusted data.
 *
 * Rule #5 holds BY CONSTRUCTION: the operator is a CLOSED enum selected by the operator, mapped to a CLOSED
 * set of vetted fragments — there is no untrusted free-text channel, so an operator selection can inject no
 * instruction beyond its system-authored fragment (an out-of-enum value is rejected by the FB.0 schema
 * before it ever reaches here). Rule #6: a fragment STEERS generation and NEVER references the held-out
 * judge / rubric / scoring / fitness — the immutable scoring anchor is unmovable by an operator. Rule #1/#8:
 * a fragment shapes the PROMPT only — it reads/changes no cap and alters no energy debit. Rule #7: the
 * assembly is a pure deterministic fn of the persisted operators → replay reconstructs the identical framing
 * with no provider call.
 */
export const OPERATOR_FRAGMENTS: Readonly<Record<GenerationOperator, string>> = {
  breakthrough:
    'Aim for a breakthrough: reject incremental tweaks and pursue a step-change in how the problem is solved.',
  first_principles:
    'Reason from first principles: decompose the problem to its fundamentals and rebuild a solution, ignoring inherited convention.',
  polymath:
    'Think as a polymath: draw analogies across unrelated disciplines and transplant a mechanism from a distant field into this one.',
  breakout:
    'Break out of the obvious framing: question the implicit assumptions and explore a solution space others overlook.',
  blindside:
    'Look for the blindside: surface the non-obvious angle or overlooked factor that conventional approaches miss.',
  subtraction:
    'Solve by subtraction: remove a component, step, or assumption and find the simpler solution that remains.',
  constraint:
    'Embrace a hard constraint: impose a deliberate limitation and let it force a more inventive approach.',
};

/**
 * Compose the run-selected operators' TRUSTED fragments into a framing suffix, in the
 * {@link GenerationOperator} ENUM's canonical declaration order (deterministic + replay-stable, rule #7),
 * de-duplicated. Returns `''` for absent/empty operators so the caller's framing stays BYTE-IDENTICAL to
 * the PD.10 baseline (backward-compatible). PURE: a function of the operators alone — it reads no cap, no
 * energy, no clock, and makes no provider call.
 */
export function composeOperatorFraming(operators?: readonly GenerationOperator[]): string {
  if (operators === undefined || operators.length === 0) return '';
  const selected = new Set(operators);
  const ordered = GenerationOperator.options.filter((op) => selected.has(op));
  if (ordered.length === 0) return '';
  return `\n\n${ordered.map((op) => OPERATOR_FRAGMENTS[op]).join('\n')}`;
}
