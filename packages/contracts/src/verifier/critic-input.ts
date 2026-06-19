import { z } from "zod";

/**
 * criticInput — the prompt-injection isolation seam (§7 / §14, T-RISK-002).
 *
 * The schema's whole purpose is to keep TRUSTED rubric/instruction text
 * structurally distinct from UNTRUSTED candidate text so a caller cannot
 * accidentally interpolate the candidate into the instruction string.
 * `CRITIC_INPUT_DELIMITER` is a stable sentinel the runtime wraps the
 * untrusted side with at prompt-assembly time.
 */

export const CRITIC_INPUT_DELIMITER = "<<<CANDIDATE>>>" as const;

export const CriticInput = z
  .object({
    trustedRubric: z.string(),
    untrustedCandidate: z.string(),
  })
  .strict();
export type CriticInput = z.infer<typeof CriticInput>;
