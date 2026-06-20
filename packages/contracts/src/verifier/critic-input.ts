import { z } from 'zod';
import { CriticMandate } from './critic-review';

/**
 * criticInput + the prompt-injection-isolation primitive (ARCHITECTURE.md §14, T-002 / RISK-008).
 *
 * KEY SAFETY RULE #5: candidate text reaches critics/judges only as DATA TO EVALUATE, never as
 * instructions. This module freezes the *shape + mechanism* that makes that enforceable; the actual
 * prompt assembly lands in the verifier track (P4). Mirrors the P0.2 precedent — a pure security
 * primitive (there `scrubSecrets` + `REDACTION_PLACEHOLDER`) lives IN the frozen contracts package
 * with a stable exported constant, so every consumer isolates identically.
 */

/**
 * The fixed delimiter that bounds untrusted candidate text. Snapshot-pinned (a drift is a §2.5
 * failure). It is PUBLIC (open-source) — so it defends accidental conflation, while {@link
 * wrapUntrusted} adds the adversarial defense (an attacker who knows the token cannot forge a
 * boundary because embedded occurrences are neutralized).
 */
export const CRITIC_INPUT_SENTINEL = '<<<DOPPL_UNTRUSTED_CANDIDATE>>>';

/**
 * Replaces any candidate-embedded sentinel. Contains `[` — a character ABSENT from the sentinel — so
 * a removed sentinel's surrounding text can never splice across this marker into a fresh sentinel.
 */
const NEUTRALIZED_SENTINEL_MARKER = '[neutralized-sentinel]';

/**
 * criticInput — models the TRUSTED rubric and the UNTRUSTED candidate as DISTINCT, non-conflatable
 * fields (§14 structural isolation). `rubric` is the critic's instructions (trusted); `candidate` is
 * untrusted free-form text rendered upstream (P4) via {@link wrapUntrusted}. Strict at both levels.
 */
export const criticInput = z.strictObject({
  rubric: z.strictObject({
    mandate: CriticMandate,
    instructions: z.string().min(1),
  }),
  candidate: z.string().min(1),
});

export type criticInput = z.infer<typeof criticInput>;

/**
 * Bound untrusted candidate `text` with {@link CRITIC_INPUT_SENTINEL} on both sides so a downstream
 * renderer can carry it as data-to-evaluate, never as instructions (§14, KEY SAFETY RULE #5).
 *
 * The candidate is ATTACKER-CONTROLLED and the sentinel is public, so an evolved agenome could embed
 * the sentinel to FORGE a delimiter boundary and smuggle a tail past the renderer as instructions
 * (T-002 / RISK-008, rule #6 reward-hacking). To stop that, every embedded occurrence is neutralized
 * first — so the result holds the sentinel EXACTLY twice (the wrappers) for ANY input. One pass is
 * provably complete: the marker contains a char the sentinel lacks (no neighbour-splice can reform a
 * sentinel) and the sentinel has no self-overlap (so non-overlapping single-pass replacement is total).
 *
 * Pure. The wrapped text is verbatim EXCEPT this necessary embedded-sentinel neutralization. NOT
 * idempotent (re-wrapping nests the wrappers as data — callers wrap once).
 */
export function wrapUntrusted(text: string): string {
  const neutralized = text.replaceAll(CRITIC_INPUT_SENTINEL, NEUTRALIZED_SENTINEL_MARKER);
  return `${CRITIC_INPUT_SENTINEL}\n${neutralized}\n${CRITIC_INPUT_SENTINEL}`;
}
